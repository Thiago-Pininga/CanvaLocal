import React, { useState } from 'react'
import { Sparkles, X, Loader2, Bot, ArrowRight } from 'lucide-react'
import { lmStudioService } from '../../services/lmStudioService'

interface MagicWriteModalProps {
  isOpen: boolean
  onClose: () => void
  initialText?: string
  onApplyText: (text: string) => void
  isLMStudioConnected: boolean
}

export const MagicWriteModal: React.FC<MagicWriteModalProps> = ({
  isOpen,
  onClose,
  initialText = '',
  onApplyText,
  isLMStudioConnected,
}) => {
  const [topic, setTopic] = useState(initialText)
  const [type, setType] = useState<'slogan' | 'headline' | 'instagram' | 'cta' | 'body'>('headline')
  const [tone, setTone] = useState<'impactante' | 'profissional' | 'divertido' | 'minimalista' | 'urgente'>('impactante')
  const [isGenerating, setIsGenerating] = useState(false)
  const [results, setResults] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleGenerate = async () => {
    if (!topic.trim()) return
    setError(null)
    setIsGenerating(true)
    try {
      const generated = await lmStudioService.magicWrite({
        topic,
        type,
        tone,
      })
      setResults(generated)
    } catch (err: any) {
      setError(err.message || 'Erro ao comunicar com o LM Studio. Certifique-se de que o servidor local está ativo.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-900/30 to-indigo-900/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center shadow">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Magic Write (LM Studio)</h3>
              <p className="text-[11px] text-slate-400">Gere textos e títulos inteligentes para o seu design com IA local</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!isLMStudioConnected && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-300">
              <Bot className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <p className="font-semibold">LM Studio desconectado</p>
                <p className="text-amber-200/80">
                  Abra o LM Studio, carregue um modelo de sua preferência e ative a aba <b>"Local Server"</b> na porta 1234 para começar a usar o Magic Write.
                </p>
              </div>
            </div>
          )}

          {/* Topic input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Sobre o que você quer escrever?
            </label>
            <textarea
              rows={2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex: Hambúrguer artesanal suculento com bacon crocante, promoção de inauguração..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500 transition"
            />
          </div>

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tipo de Texto
            </label>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {[
                { id: 'headline', label: 'Título Marcante' },
                { id: 'slogan', label: 'Slogan / Frase' },
                { id: 'cta', label: 'Botão / CTA' },
                { id: 'instagram', label: 'Post / Legenda' },
                { id: 'body', label: 'Parágrafo' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg border text-center transition ${
                    type === t.id
                      ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-medium'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tone Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Tom de Voz
            </label>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { id: 'impactante', label: '⚡ Impactante' },
                { id: 'profissional', label: '💼 Profissional' },
                { id: 'divertido', label: '🎉 Divertido' },
                { id: 'minimalista', label: '✨ Minimalista' },
                { id: 'urgente', label: '🔥 Urgente / Promoção' },
              ].map((tn) => (
                <button
                  key={tn.id}
                  onClick={() => setTone(tn.id as any)}
                  className={`px-2.5 py-1 rounded-lg border transition ${
                    tone === tn.id
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300 font-medium'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {tn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!topic.trim() || isGenerating}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-indigo-600 hover:opacity-95 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Gerando opções com LM Studio...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Gerar Sugestões</span>
              </>
            )}
          </button>

          {/* Error message */}
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-xl">
              {error}
            </p>
          )}

          {/* Generated Results */}
          {results.length > 0 && (
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <label className="block text-xs font-semibold text-purple-300">
                Sugestões Geradas (Clique para aplicar no Canvas):
              </label>
              {results.map((text, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    onApplyText(text)
                    onClose()
                  }}
                  className="p-3 bg-slate-800/80 hover:bg-purple-950/40 border border-slate-700 hover:border-purple-500/50 rounded-xl cursor-pointer group transition flex items-center justify-between text-xs"
                >
                  <span className="text-slate-200 group-hover:text-white leading-relaxed">
                    {text}
                  </span>
                  <ArrowRight className="w-4 h-4 text-purple-400 opacity-0 group-hover:opacity-100 shrink-0 ml-2 transition" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
