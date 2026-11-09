import type { SavedProject } from '../types'

const DB_NAME = 'CanvaLocalDB'
const DB_VERSION = 2
const STORE_NAME = 'recent_projects'
const HANDLE_STORE_NAME = 'project_file_handles'
const MAX_RECENT = 5

export interface SaveProjectResult {
  recentProjects: SavedProject[]
  updatedExistingFile: boolean
  updatedInRecentsOnly: boolean
  fileName?: string
}

class ProjectStorageService {
  // In-memory cache of FileSystemFileHandle by project ID for instant in-place file updates
  private fileHandles = new Map<string, any>()

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(HANDLE_STORE_NAME)) {
          db.createObjectStore(HANDLE_STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  private async getStoredFileHandle(projectId: string): Promise<any | null> {
    if (this.fileHandles.has(projectId)) {
      return this.fileHandles.get(projectId)
    }
    try {
      const db = await this.openDB()
      return await new Promise((resolve) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readonly')
        const store = tx.objectStore(HANDLE_STORE_NAME)
        const req = store.get(projectId)
        req.onsuccess = () => {
          const handle = req.result || null
          if (handle) {
            this.fileHandles.set(projectId, handle)
          }
          resolve(handle)
        }
        req.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  }

  private async setStoredFileHandle(projectId: string, handle: any): Promise<void> {
    this.fileHandles.set(projectId, handle)
    try {
      const db = await this.openDB()
      await new Promise<void>((resolve) => {
        const tx = db.transaction(HANDLE_STORE_NAME, 'readwrite')
        const store = tx.objectStore(HANDLE_STORE_NAME)
        store.put(handle, projectId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      })
    } catch {
      // Ignore if browser does not support cloning FileSystemFileHandle
    }
  }

  private async writeToFileHandle(handle: any, content: string): Promise<boolean> {
    try {
      if (handle.queryPermission) {
        let perm = await handle.queryPermission({ mode: 'readwrite' })
        if (perm !== 'granted' && handle.requestPermission) {
          perm = await handle.requestPermission({ mode: 'readwrite' })
        }
        if (perm !== 'granted') return false
      }
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return true
    } catch (e) {
      console.warn('Não foi possível sobrescrever o arquivo via FileSystemFileHandle:', e)
      return false
    }
  }

  /**
   * Save or update a project:
   * - If the project already has an associated file on disk (opened or previously saved),
   *   it overwrites/updates that EXACT file in-place without downloading duplicates.
   * - If the project already exists in Recent Projects (IndexedDB), it updates it in-place
   *   without triggering a duplicate file download.
   * - If it is a brand-new project being saved for the first time, it opens the native Save File Picker
   *   (if supported) to link the file handle for all subsequent saves, or downloads once.
   */
  async saveProject(
    project: SavedProject,
    syncToDisk = true,
    forceSaveAsNewFile = false
  ): Promise<SaveProjectResult> {
    const jsonString = JSON.stringify(project, null, 2)
    const safeName = (project.title || 'projeto')
      .toLowerCase()
      .replace(/[^a-z0-9-_]/gi, '_')
    const defaultFileName = `${safeName}.canvalocal.json`

    const allRecents = await this.getRecentProjects()
    const existingInRecents = allRecents.find(
      (p) => p.id === project.id || p.title.trim().toLowerCase() === project.title.trim().toLowerCase()
    )

    // Ensure we keep the canonical ID if updating an existing project with the same title
    if (existingInRecents && existingInRecents.id !== project.id) {
      project = { ...project, id: existingInRecents.id }
    }

    let updatedExistingFile = false
    let updatedInRecentsOnly = false
    let savedFileName: string | undefined

    if (syncToDisk) {
      // 1. Check if we already have a FileSystemFileHandle for this project
      const existingHandle = !forceSaveAsNewFile
        ? await this.getStoredFileHandle(project.id)
        : null

      if (existingHandle) {
        // Update the existing file on disk in-place!
        const ok = await this.writeToFileHandle(existingHandle, jsonString)
        if (ok) {
          updatedExistingFile = true
          savedFileName = existingHandle.name || defaultFileName
        }
      }

      // 2. If not updated via handle yet:
      if (!updatedExistingFile) {
        if (existingInRecents && !forceSaveAsNewFile) {
          // Project already exists in the app's Recent Projects — just update it in-place
          // without downloading duplicate "(1).canvalocal.json" files!
          updatedInRecentsOnly = true
        } else if (typeof (window as any).showSaveFilePicker === 'function') {
          // First time saving to disk (or explicit "Salvar Como"): use File System Access API
          // so future saves overwrite this exact file in-place
          try {
            const handle = await (window as any).showSaveFilePicker({
              suggestedName: defaultFileName,
              types: [
                {
                  description: 'Projeto CanvaLocal (.canvalocal.json)',
                  accept: { 'application/json': ['.canvalocal.json', '.json'] },
                },
              ],
            })
            const ok = await this.writeToFileHandle(handle, jsonString)
            if (ok) {
              await this.setStoredFileHandle(project.id, handle)
              updatedExistingFile = true
              savedFileName = handle.name || defaultFileName
            }
          } catch (err: any) {
            // If user cancelled the file picker dialog, still save in Recent Projects
            if (err?.name === 'AbortError') {
              updatedInRecentsOnly = true
            }
          }
        } else {
          // Fallback for browsers without showSaveFilePicker (only on first save or explicit export)
          const blob = new Blob([jsonString], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = defaultFileName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          savedFileName = defaultFileName
        }
      }
    }

    // 3. Update in IndexedDB recent projects (max 5) in-place
    try {
      const db = await this.openDB()
      const filtered = allRecents.filter(
        (p) => p.id !== project.id && p.title.trim().toLowerCase() !== project.title.trim().toLowerCase()
      )
      const updated = [project, ...filtered].slice(0, MAX_RECENT)

      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      for (const item of updated) {
        store.put(item)
      }

      const recentProjects = await new Promise<SavedProject[]>((resolve) => {
        tx.oncomplete = () => resolve(updated)
        tx.onerror = () => resolve(updated)
      })

      return {
        recentProjects,
        updatedExistingFile,
        updatedInRecentsOnly,
        fileName: savedFileName,
      }
    } catch (e) {
      console.warn('Erro ao salvar nos projetos recentes:', e)
      return {
        recentProjects: [],
        updatedExistingFile,
        updatedInRecentsOnly,
        fileName: savedFileName,
      }
    }
  }

  /**
   * Open a project file using native File System Access API (when available)
   * so that subsequent Ctrl+S saves update the exact same file on disk in-place.
   */
  async openProjectWithFilePicker(): Promise<SavedProject | null> {
    if (typeof (window as any).showOpenFilePicker !== 'function') {
      return null
    }
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'Projeto CanvaLocal (.canvalocal.json)',
            accept: { 'application/json': ['.canvalocal.json', '.json'] },
          },
        ],
      })
      if (!handle) return null
      const file: File = await handle.getFile()
      const proj = await this.importProjectFromFile(file)
      const canonicalId = proj.id || `proj-${Date.now()}`
      proj.id = canonicalId
      await this.setStoredFileHandle(canonicalId, handle)
      return proj
    } catch (err: any) {
      if (err?.name === 'AbortError') return null
      throw err
    }
  }

  /**
   * Check if a project currently has a linked disk file handle
   */
  hasLinkedFile(projectId: string): boolean {
    return this.fileHandles.has(projectId)
  }

  /**
   * Get the 5 most recent projects sorted by updatedAt descending
   */
  async getRecentProjects(): Promise<SavedProject[]> {
    try {
      const db = await this.openDB()
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.getAll()
        req.onsuccess = () => {
          const list = (req.result || []) as SavedProject[]
          list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          // Preload any stored file handles into memory
          list.forEach((p) => {
            this.getStoredFileHandle(p.id).catch(() => {})
          })
          resolve(list.slice(0, MAX_RECENT))
        }
        req.onerror = () => resolve([])
      })
    } catch {
      return []
    }
  }

  /**
   * Delete a project from recent list
   */
  async deleteRecentProject(id: string): Promise<SavedProject[]> {
    try {
      this.fileHandles.delete(id)
      const db = await this.openDB()
      const tx = db.transaction([STORE_NAME, HANDLE_STORE_NAME], 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
      tx.objectStore(HANDLE_STORE_NAME).delete(id)
      return new Promise((resolve) => {
        tx.oncomplete = async () => {
          const list = await this.getRecentProjects()
          resolve(list)
        }
      })
    } catch {
      return []
    }
  }

  /**
   * Read a .canvalocal.json file uploaded from disk
   */
  async importProjectFromFile(file: File): Promise<SavedProject> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string)
          if (!parsed.pages || !Array.isArray(parsed.pages)) {
            throw new Error('Arquivo de projeto inválido.')
          }
          resolve(parsed as SavedProject)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('Falha ao ler arquivo.'))
      reader.readAsText(file)
    })
  }
}

export const projectStorageService = new ProjectStorageService()
