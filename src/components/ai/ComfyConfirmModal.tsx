import React, { useState, useEffect } from 'react'
import { X, AlertTriangle, Sparkles, Loader2, CheckCircle2, Wand2 } from 'lucide-react'
import { comfyOnDemandService } from '../../services/comfyOnDemandService'
import { lmStudioService } from '../../services/lmStudioService'

interface ComfyConfirmModalProps {
  isOpen: boolean
  mode: 'generate' | 'remove-bg'
  initialPrompt?: string
  onClose: () => void
  onImageGenerated?: (imageUrl: string) => void
  onConfirmRemoveBg?: () => Promise<void>
}

export const ComfyConfirmModal: React.FC<ComfyConfirmModalProps> = ({
  isOpen,
  mode,
  initialPrompt = '',
  onClose,
  onImageGenerated,
  onConfirmRemoveBg,
}) => {
  const [step, setStep] = useState<'confirm' | 'generating'>('confirm')
  const [prompt, setPrompt] = useState(initialPrompt)
  const [style, setStyle] = useState('fotorealista')
  const [isEnhancing, setIsEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStep('confirm')
      setPrompt(initialPrompt)
      setError(null)
      setStatusMessage('')
    }
  }, [isOpen, initialPrompt])

  if (!isOpen) return null

  const handleEnhanceWithLM = async () => {
    if (!prompt.trim() || isEnhancing) return
    setIsEnhancing(true)
    try {
      const enhanced = await lmStudioService.enhancePrompt(prompt)
      setPrompt(enhanced.positive)
    } catch {
      // keep current prompt if LM Studio unavailable
    } finally {
      setIsEnhancing(false)
    }
  }

  const handleConfirmAndExecute = async () => {
    setError(null)
    setStep('generating')
    setStatusMessage('Verificando se o ComfyUI está ligado na porta 8188...')

    try {
      const status = await comfyOnDemandService.verifyConnection()
      if (!status.online) {
        setStep('confirm')
        setError(
          'O ComfyUI não respondeu na porta 8188! Abra o seu ComfyUI (run_nvidia_gpu.bat), aguarde ele iniciar e tente novamente.'
        )
        return
      }

      if (mode === 'remove-bg') {
        setStatusMessage('ComfyUI conectado! Removendo fundo da imagem com BiRefNet...')
        if (onConfirmRemoveBg) {
          await onConfirmRemoveBg()
        }
        onClose()
        return
      }

      // Generate image mode
      const modelLabel = status.unetModel ? 'Z-Image-Turbo (1024×1024 • 8 steps)' : status.gpuName
      setStatusMessage(`ComfyUI conectado (${modelLabel})! Gerando sua imagem...`)
      const stylePrefixes: Record<string, string> = {
        fotorealista: 'hyperrealistic photograph, 8k, cinematic lighting, sharp focus, ',
        '3d': '3d render, octane render, cute 3d icon, pixar style, bright studio light, ',
        ilustracao: 'modern flat vector illustration, vibrant colors, clean design, ',
        anime: 'anime style, vibrant colors, detailed illustration, studio ghibli, ',
        cyberpunk: 'cyberpunk neon aesthetic, futuristic, volumetric lighting, ',
      }

      const fullPrompt = (stylePrefixes[style] || '') + (prompt.trim() || 'modern creative graphic element')
      const imageUrl = await comfyOnDemandService.generateImage({
        prompt: fullPrompt,
        width: 1024,
        height: 1024,
        steps: 8,
      })

      onImageGenerated?.(imageUrl)
      onClose()
    } catch (err: any) {
      setStep('confirm')
      setError(err.message || 'Erro ao executar tarefa no ComfyUI.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {mode === 'remove-bg' ? 'Confirmar Uso do ComfyUI (Remover Fundo)' : 'Gerar Imagem com ComfyUI (Sob Demanda)'}
              </h3>
              <p className="text-[11px] text-slate-400">Conexão pontual mediante sua confirmação</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={step === 'generating'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Explicit Confirmation Question */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>O seu ComfyUI já está aberto e ligado?</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              O Canva Local <strong>não mantém conexão ativa</strong> com o ComfyUI para economizar recursos. Ao confirmar abaixo, faremos uma única chamada na porta <code>8188</code>.
            </p>
          </div>

          {mode === 'generate' && step === 'confirm' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">Descreva a imagem que deseja criar:</label>
                  <button
                    type="button"
                    onClick={handleEnhanceWithLM}
                    disabled={!prompt.trim() || isEnhancing}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium disabled:opacity-40"
                    title="Usar o LM Studio para detalhar o prompt em inglês"
                  >
                    {isEnhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    <span>Turbinar com LM Studio</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex: hambúrguer artesanal suculento com queijo derretendo, iluminação de estúdio..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">Estilo Visual:</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'fotorealista', label: '📸 Foto Real' },
                    { id: '3d', label: '🧸 3D Render' },
                    { id: 'ilustracao', label: '🎨 Vetor / Flat' },
                    { id: 'anime', label: '✨ Anime' },
                    { id: 'cyberpunk', label: '⚡ Neon' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setStyle(st.id)}
                      className={`py-1.5 px-2 rounded-lg border text-[11px] transition ${
                        style === st.id
                          ? 'bg-purple-600/25 border-purple-500 text-purple-200 font-semibold'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'generating' && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <div className="text-xs font-semibold text-white">{statusMessage}</div>
              <p className="text-[11px] text-slate-400">Aguarde alguns segundos enquanto o ComfyUI processa...</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs leading-relaxed">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={step === 'generating'}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmAndExecute}
            disabled={step === 'generating' || (mode === 'generate' && !prompt.trim())}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition disabled:opacity-40"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sim, o ComfyUI está ligado — Executar</span>
          </button>
        </div>
      </div>
    </div>
  )
}

