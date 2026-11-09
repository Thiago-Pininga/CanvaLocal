import type { SavedProject } from '../types'

const DB_NAME = 'CanvaLocalDB'
const STORE_NAME = 'recent_projects'
const MAX_RECENT = 5

class ProjectStorageService {
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Save project to IndexedDB (keeps only top 5 most recent)
   * and trigger browser download of a .canvalocal.json file
   */
  async saveProject(project: SavedProject, downloadFile = true): Promise<SavedProject[]> {
    // 1. Trigger .canvalocal.json file download if requested (Ctrl+S or Save button)
    if (downloadFile) {
      const jsonString = JSON.stringify(project, null, 2)
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const safeName = (project.title || 'projeto')
        .toLowerCase()
        .replace(/[^a-z0-9-_]/gi, '_')
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeName}.canvalocal.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }

    // 2. Store in IndexedDB recent projects (max 5)
    try {
      const db = await this.openDB()
      const all = await this.getRecentProjects()

      // Filter out any existing with same id or same title to update it in-place
      const filtered = all.filter((p) => p.id !== project.id && p.title !== project.title)
      const updated = [project, ...filtered].slice(0, MAX_RECENT)

      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.clear()
      for (const item of updated) {
        store.put(item)
      }

      return new Promise((resolve) => {
        tx.oncomplete = () => resolve(updated)
        tx.onerror = () => resolve(updated)
      })
    } catch (e) {
      console.warn('Erro ao salvar nos projetos recentes:', e)
      return []
    }
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
      const db = await this.openDB()
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(id)
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

