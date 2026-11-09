import type { LMStudioStatus, DesignLayoutStyle, EditorialSlideSpec, GeneratedDesignSpec } from '../types'

export type SketchVectorType =
  | 'circle'
  | 'rect'
  | 'triangle'
  | 'star'
  | 'heart'
  | 'hexagon'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'house'
  | 'tree'
  | 'cloud'
  | 'check'
  | 'sun'
  | 'custom-svg'

export interface SketchUnderstandingResult {
  meaning: string
  explanation: string
  vectorType: SketchVectorType
  svgPath?: string
  imagePrompt: string
}

export class LMStudioService {
  private baseUrl = '/api/lmstudio/v1'
  private selectedModel: string = ''

  public setSelectedModel(modelId: string) {
    this.selectedModel = modelId
  }

  public getSelectedModel(): string {
    return this.selectedModel
  }

  /**
   * Check connection and list loaded models
   */
  async checkStatus(): Promise<LMStudioStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) throw new Error('LM Studio offline')

      const data = await res.json()
      const rawModels = data.data ? data.data.map((m: any) => m.id) : []
      const llmModels = rawModels.filter((id: string) => !id.includes('embed') && !id.includes('embedding'))
      const models = llmModels.length > 0 ? llmModels : rawModels

      if (!this.selectedModel || !models.includes(this.selectedModel)) {
        const preferred = models.find(
          (m: string) => m.includes('gemma') || m.includes('llama') || m.includes('qwen') || m.includes('mistral')
        )
        this.selectedModel = preferred || models[0] || ''
      }

      return {
        connected: true,
        models,
        activeModel: this.selectedModel,
        lastChecked: new Date(),
      }
    } catch {
      return {
        connected: false,
        models: [],
        lastChecked: new Date(),
      }
    }
  }

  /**
   * Helper to extract clean final content without internal reasoning/thinking blocks
   */
  private extractMessageContent(choice: any): string {
    const msg = choice?.message
    if (!msg) return ''

    let text = ''
    if (msg.content && msg.content.trim()) {
      text = msg.content.trim()
    } else if (msg.reasoning_content && msg.reasoning_content.trim()) {
      const r = msg.reasoning_content.trim()
      const jsonMatch = r.match(/\{[\s\S]*\}/)
      if (jsonMatch) return jsonMatch[0]
      const lines = r.split('\n').filter((l: string) => l.trim().length > 0 && !l.trim().startsWith('*'))
      text = lines[lines.length - 1] || r
    }

    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim()
    return text
  }

  /**
   * Magic Write: Generate titles, slogans, captions, marketing copy
   */
  async magicWrite({
    topic,
    type = 'slogan',
    tone = 'impactante',
    customInstructions = '',
  }: {
    topic: string
    type?: 'slogan' | 'headline' | 'instagram' | 'cta' | 'body'
    tone?: 'impactante' | 'profissional' | 'divertido' | 'minimalista' | 'urgente'
    customInstructions?: string
  }): Promise<string[]> {
    const promptMap: Record<string, string> = {
      slogan: 'Crie 3 opções de slogans curtos, memoráveis e persuasivos',
      headline: 'Crie 3 opções de títulos impactantes para flyer/banner',
      instagram: 'Crie 2 opções de legendas para Instagram com emojis e hashtags relevantes',
      cta: 'Crie 4 opções de textos curtos para botões de Call To Action (chamada para ação)',
      body: 'Escreva um parágrafo publicitário cativante de 2 a 3 frases',
    }

    const taskDesc = promptMap[type] || promptMap.slogan

    const systemPrompt = `Você é um redator publicitário de elite e designer especialista estilo Canva.
Gere respostas diretas, criativas e prontas para uso em design gráfico.
Não inclua explicações longas ou introduções. Apenas retorne as opções numeradas (1., 2., 3.).`

    const userPrompt = `Tarefa: ${taskDesc}
Tema/Assunto: "${topic}"
Tom de voz desejado: ${tone}
${customInstructions ? `Instruções adicionais: ${customInstructions}` : ''}`

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.selectedModel || undefined,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    })

    if (!res.ok) {
      throw new Error('Falha na comunicação com o LM Studio. Verifique se o servidor local está ativo.')
    }

    const data = await res.json()
    const rawText = this.extractMessageContent(data.choices?.[0])

    const options = rawText
      .split('\n')
      .map((line) => line.replace(/^[\d\.\-\*\s]+/, '').trim())
      .filter((line) => line.length > 2)

    return options.length > 0 ? options : [rawText.trim()]
  }

  /**
   * Prompt Enhancer: Expands simple ideas into high-detail Stable Diffusion prompts for ComfyUI
   */
  async enhancePrompt(simpleIdea: string): Promise<{ positive: string; negative: string }> {
    const systemPrompt = `You are an expert AI prompt engineer specializing in Stable Diffusion and Midjourney.
Convert the user's idea into an optimal, highly detailed visual prompt in English.
Include lighting, artistic style, composition, camera details, and high-quality descriptors.
Output JSON with keys "positive" and "negative". Example format:
{"positive": "...", "negative": "..."}`

    const userPrompt = `Expand this idea into a masterwork image prompt: "${simpleIdea}"`

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.selectedModel || undefined,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    })

    if (!res.ok) {
      throw new Error('Falha ao turbinar prompt com LM Studio.')
    }

    const data = await res.json()
    const content = this.extractMessageContent(data.choices?.[0])

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          positive: parsed.positive || simpleIdea,
          negative: parsed.negative || 'blurry, distorted, low quality, artifacts, watermark',
        }
      }
    } catch {}

    return {
      positive: content.replace(/["{}]/g, '').trim() || simpleIdea,
      negative: 'blurry, low quality, distorted, watermark',
    }
  }

  /**
   * Canva Editorial Agency Copilot:
   * Generates or re-edits a 5-page high-complexity editorial carousel (like "Pipa Arquitetura")
   * with bicolor headlines, curved callout arrows, picture-in-picture zoom, and legend boxes.
   */
  async designCopilot(
    command: string,
    images?: string[],
    colorsSummary?: string,
    mode: 'single' | 'carousel' = 'carousel',
    currentSpec?: GeneratedDesignSpec,
    activePageIndex = 0
  ): Promise<{
    reply: string
    designSpec: Omit<GeneratedDesignSpec, 'palette'>
  }> {
    const hasImages = Boolean(images && images.length > 0)
    const isEditMode = Boolean(currentSpec && currentSpec.slides && currentSpec.slides.length > 0)
    // Always create 5 pages unless user explicitly toggled single post with 0-1 image
    const isCarousel =
      isEditMode ||
      mode === 'carousel' ||
      (images && images.length > 1) ||
      /carrossel|paginas|páginas|slides/i.test(command)

    // Pre-apply deterministic edits if we already have an active designSpec so explicit user instructions
    // ("mude o título do slide 2 para...", "troque X por Y", "altere o subtítulo...") are 100% guaranteed
    const preEditedBase = isEditMode
      ? this.applyDeterministicEdits(currentSpec!, command, activePageIndex)
      : undefined

    const systemPrompt = isEditMode
      ? `Você é um Diretor de Arte Sênior de uma agência estilo Canva Editorial.
O usuário JÁ POSSUI um Carrossel de 5 Páginas ativo e pediu uma ALTERAÇÃO / REEDIÇÃO.
Página aberta na tela do usuário agora: Slide ${activePageIndex + 1} (índice ${activePageIndex}).

REGRA DE OURO DE REEDIÇÃO:
1. Modifique APENAS os slides e campos que o usuário pediu para alterar no comando dele.
2. Se o usuário pedir para mudar "o título", "o subtítulo" ou "o texto" sem citar o número do slide, aplique a alteração no Slide ${activePageIndex + 1} (índice ${activePageIndex}).
3. Se o usuário citar um slide específico (ex: "Slide 1", "Capa", "Slide 2", "Slide 3", "Slide 4", "Slide 5", "último slide"), altere exatamente esse slide.
4. Mantenha TODOS os outros slides e textos que não foram mencionados EXATAMENTE como estão no JSON atual.
5. Retorne o JSON completo com os 5 slides em formato JSON ESTRITO (sem blocos de raciocínio fora do JSON):
{
  "reply": "Explicação curta confirmando exatamente o que foi alterado",
  "brandName": "...",
  "brandTagline": "...",
  "kicker": "...",
  "footerMain": "...",
  "footerSub": "...",
  "suggestedImagePrompt": "...",
  "slides": [ ... 5 objetos mantendo slideType: "cover" | "challenge" | "opportunity" | "solution" | "detail" ... ]
}`
      : `Você é um Diretor de Arte Sênior de uma agência de design estilo Canva Editorial ("Pipa Arquitetura").
Crie um roteiro completo e sofisticado de Carrossel de 5 Páginas em formato JSON ESTRITO.
Estrutura obrigatória do JSON:
{
  "reply": "Resumo curto e elegante em português sobre o carrossel de 5 páginas criado",
  "brandName": "Nome curto da Marca ou Projeto (ex: PiPa, Studio, Aura)",
  "brandTagline": "Subtítulo da marca em caixa alta (ex: ARQUITETURA, DESIGN, CONSULTORIA)",
  "kicker": "FRASE CURTA DE TOPO EM CAIXA ALTA (ex: ARQUITETURA A FAVOR DA SAÚDE)",
  "footerMain": "FRASE PRINCIPAL DO RODAPÉ (ex: ESPAÇOS BEM PENSADOS)",
  "footerSub": "FRASE SECUNDÁRIA DO RODAPÉ (ex: PARA CUIDAR DE PESSOAS)",
  "suggestedImagePrompt": "Detailed English prompt for a high-end architectural or studio photography matching this project",
  "slides": [
    {
      "slideType": "cover",
      "titleLine1": "Nome da Marca ou Título Curto",
      "titleLine2": "TAGLINE ESPAÇADA",
      "subtitle": "Apresentação sofisticada do estudo de caso"
    },
    {
      "slideType": "challenge",
      "sideTag": "LEVANTAMENTO DO CENÁRIO ATUAL",
      "titleLine1": "O espaço",
      "titleLine2": "original:",
      "subtitle": "Explicação concisa de 2 linhas sobre o desafio inicial e necessidades técnicas.",
      "callouts": ["Geometria irregular", "Ângulos difíceis", "Múltiplos acessos"]
    },
    {
      "slideType": "opportunity",
      "sideTag": "VISÃO ESTRATÉGICA",
      "titleLine1": "Cenário complexo é",
      "titleLine2": "problema ou oportunidade?",
      "subtitle": "Neste projeto, transformamos cada limitação em um ambiente completo, funcional e acolhedor."
    },
    {
      "slideType": "solution",
      "sideTag": "PROPOSTA DE VALOR",
      "titleLine1": "Aqui está",
      "titleLine2": "a solução!",
      "subtitle": "Distribuição inteligente, fluxo otimizado e cada detalhe aproveitado com máxima eficiência."
    },
    {
      "slideType": "detail",
      "kicker": "FOCO NO DETALHE",
      "titleLine1": "Área técnica",
      "titleLine2": "e circulação",
      "subtitle": "ORGANIZAÇÃO QUE FAZ A DIFERENÇA NO RESULTADO",
      "legendTitle1": "Fluxo principal",
      "legendDesc1": "Clientes e atendimento",
      "legendTitle2": "Fluxo técnico",
      "legendDesc2": "Apoio e operação",
      "detailHeading": "Excelência técnica exige rigor:",
      "detailBody": "Separação inteligente de fluxos e conforto tanto para o cliente quanto para a equipe."
    }
  ]
}`

    const promptText = isEditMode
      ? `ESTADO ATUAL DO CARROSSEL (JSON):
${JSON.stringify(
  {
    brandName: preEditedBase?.designSpec.brandName,
    brandTagline: preEditedBase?.designSpec.brandTagline,
    slides: preEditedBase?.designSpec.slides,
  },
  null,
  2
)}

PEDIDO DE ALTERAÇÃO DO USUÁRIO (Slide aberto na tela: Slide ${activePageIndex + 1}):
"${command}"

Aplique a alteração pedida acima mantendo o restante intacto e retorne o JSON atualizado.`
      : `Tema / Pedido do usuário: "${command || 'Estudo de caso profissional de arquitetura e design de interiores'}"
Quantidade de imagens anexadas: ${images?.length || 0}
${colorsSummary ? `Cores dominantes extraídas das imagens: ${colorsSummary}` : ''}`

    // 1. Try multimodal vision request if images are attached (only on initial creation to save time on text edits)
    if (hasImages && images && !isEditMode) {
      try {
        const userContent: any[] = [{ type: 'text', text: promptText }]
        for (const img of images.slice(0, 5)) {
          userContent.push({
            type: 'image_url',
            image_url: { url: img },
          })
        }

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.selectedModel || undefined,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
            temperature: 0.4,
            max_tokens: 2500,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          const raw = this.extractMessageContent(data.choices?.[0])
          const parsed = this.parseEditorialJson(raw, command, isCarousel, preEditedBase?.designSpec)
          if (parsed) return parsed
        }
      } catch {}
    }

    // 2. Text request with the selected LM Studio model
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.selectedModel || undefined,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptText },
          ],
          temperature: isEditMode ? 0.25 : 0.6,
          max_tokens: 2500,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const raw = this.extractMessageContent(data.choices?.[0])
        const parsed = this.parseEditorialJson(raw, command, isCarousel, preEditedBase?.designSpec)
        if (parsed) return parsed
      }
    } catch {}

    if (preEditedBase) {
      return preEditedBase
    }

    return this.buildRichEditorialFallback(command, isCarousel)
  }

  /**
   * Deterministically applies explicit user edit commands ("mude o título do slide 2 para...",
   * "troque X por Y", "no slide 1 coloque...", etc.) onto the existing GeneratedDesignSpec
   * so edits always work reliably even before/without LLM hallucination.
   */
  private applyDeterministicEdits(
    currentSpec: GeneratedDesignSpec,
    command: string,
    activePageIndex = 0
  ): {
    reply: string
    designSpec: Omit<GeneratedDesignSpec, 'palette'>
  } {
    const clonedSlides: EditorialSlideSpec[] = (currentSpec.slides || []).map((s) => ({
      ...s,
      callouts: s.callouts ? [...s.callouts] : undefined,
    }))

    let brandName = currentSpec.brandName || 'PiPa'
    let brandTagline = currentSpec.brandTagline || 'ARQUITETURA'
    const cmd = command.trim()

    // Detect target slide index (0..4) from user command, or default to activePageIndex
    let targetIdx = Math.min(Math.max(0, activePageIndex), Math.max(0, clonedSlides.length - 1))
    const slideMatch = cmd.match(/(?:slide|p[aá]gina|pag|tela)\s*([1-5])/i)
    if (slideMatch) {
      targetIdx = parseInt(slideMatch[1], 10) - 1
    } else if (/\bcapa\b|\bprimeir[ao]\b/i.test(cmd)) {
      targetIdx = 0
    } else if (/\bdesafio\b|\bsegund[ao]\b/i.test(cmd)) {
      targetIdx = 1
    } else if (/\boportunidade\b|\bterceir[ao]\b/i.test(cmd)) {
      targetIdx = 2
    } else if (/\bsolu[cç][aã]o\b|\bquart[ao]\b/i.test(cmd)) {
      targetIdx = 3
    } else if (/\bdetalh|\bquint[ao]\b|\b[uú]ltim[ao]\b/i.test(cmd)) {
      targetIdx = 4
    }

    // 1. Check for exact "troque/mude/substitua 'A' por/para 'B'" across all slides
    const replaceQuoted = cmd.match(/(?:troque|mude|altere|substitua)\s+["“']([^"”']+)["”']\s+(?:por|para)\s+["“']([^"”']+)["”']/i)
    if (replaceQuoted) {
      const [, fromStr, toStr] = replaceQuoted
      const re = new RegExp(fromStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      clonedSlides.forEach((s) => {
        if (s.titleLine1) s.titleLine1 = s.titleLine1.replace(re, toStr)
        if (s.titleLine2) s.titleLine2 = s.titleLine2.replace(re, toStr)
        if (s.subtitle) s.subtitle = s.subtitle.replace(re, toStr)
        if (s.footerMain) s.footerMain = s.footerMain.replace(re, toStr)
        if (s.footerSub) s.footerSub = s.footerSub.replace(re, toStr)
        if (s.detailHeading) s.detailHeading = s.detailHeading.replace(re, toStr)
        if (s.detailBody) s.detailBody = s.detailBody.replace(re, toStr)
      })
    }

    // Extract new value in quotes if present, or after "para:" / "para " / "por "
    const quotedMatch = cmd.match(/["“']([^"”']{2,})["”']/)
    const afterParaMatch = cmd.match(/(?:para|por|como)\s*[:=-]?\s*["“']?(.+?)["”']?$/i)
    const extractedValue = (quotedMatch?.[1] || afterParaMatch?.[1] || '').trim()

    if (extractedValue && clonedSlides[targetIdx]) {
      const targetSlide = clonedSlides[targetIdx]

      if (/rodap[eé]|footer/i.test(cmd)) {
        clonedSlides.forEach((s) => {
          s.footerMain = extractedValue.toUpperCase()
        })
      } else if (/\bmarca\b|\blogo\b|\bnome da empresa\b/i.test(cmd)) {
        brandName = extractedValue
        if (clonedSlides[0]) clonedSlides[0].titleLine1 = extractedValue
      } else if (/subt[ií]tulo|descri[cç][aã]o|par[aá]grafo|explica[cç][aã]o/i.test(cmd)) {
        targetSlide.subtitle = extractedValue
        if (targetSlide.slideType === 'detail') {
          targetSlide.detailBody = extractedValue
        }
      } else if (/callout|seta|apontamento/i.test(cmd)) {
        const parts = extractedValue.split(/,|;|\|/).map((p) => p.trim()).filter(Boolean)
        if (parts.length > 0) {
          targetSlide.callouts = [
            parts[0] || targetSlide.callouts?.[0] || 'Detalhe 1',
            parts[1] || targetSlide.callouts?.[1] || 'Detalhe 2',
            parts[2] || targetSlide.callouts?.[2] || 'Detalhe 3',
          ]
        }
      } else if (/t[ií]tulo|headline|cabe[cç]alho|chamada|frase|texto/i.test(cmd)) {
        const words = extractedValue.split(/\s+/)
        if (words.length <= 2) {
          targetSlide.titleLine1 = words[0] || extractedValue
          targetSlide.titleLine2 = words.slice(1).join(' ') || ''
        } else {
          const mid = Math.ceil(words.length / 2)
          targetSlide.titleLine1 = words.slice(0, mid).join(' ')
          targetSlide.titleLine2 = words.slice(mid).join(' ')
        }
      }
    }

    return {
      reply: `Alteração aplicada no Slide ${targetIdx + 1}! O carrossel foi atualizado preservando suas imagens e configurações.`,
      designSpec: {
        theme: currentSpec.theme || brandTagline,
        mood: currentSpec.mood || 'Editorial Arquitetônico',
        brandName,
        brandTagline,
        headline: currentSpec.headline || 'O espaço original:',
        subtitle: currentSpec.subtitle || '',
        badgeText: currentSpec.badgeText || 'ARQUITETURA A FAVOR DA SAÚDE',
        ctaText: currentSpec.ctaText || 'ESPAÇOS BEM PENSADOS',
        layoutStyle: currentSpec.layoutStyle || 'editorial',
        fontFamily: currentSpec.fontFamily || 'Montserrat',
        suggestedImagePrompt: currentSpec.suggestedImagePrompt || '',
        slides: clonedSlides,
      },
    }
  }

  private parseEditorialJson(
    raw: string,
    fallbackCommand: string,
    isCarousel: boolean,
    existingSpec?: Omit<GeneratedDesignSpec, 'palette'>
  ) {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return null
      const parsed = JSON.parse(jsonMatch[0])

      const fallback = this.buildRichEditorialFallback(fallbackCommand, isCarousel)
      const baseSpec = existingSpec || fallback.designSpec
      const baseSlides = baseSpec.slides || fallback.designSpec.slides!

      const brandName = parsed.brandName || baseSpec.brandName
      const brandTagline = parsed.brandTagline || baseSpec.brandTagline
      const kicker = parsed.kicker || baseSlides[0]?.kicker || 'ARQUITETURA & DESIGN ESTRATÉGICO'
      const footerMain = parsed.footerMain || baseSlides[0]?.footerMain || 'ESPAÇOS BEM PENSADOS'
      const footerSub = parsed.footerSub || baseSlides[0]?.footerSub || 'PARA CUIDAR DE PESSOAS'

      const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : []

      // Merge LLM slides onto baseSlides (which is currentSpec when editing!)
      const slides: EditorialSlideSpec[] = baseSlides.map((defSlide, idx) => {
        const s = rawSlides[idx] || {}
        return {
          slideType: defSlide.slideType,
          kicker: s.kicker || defSlide.kicker || kicker,
          sideTag: s.sideTag || defSlide.sideTag,
          titleLine1: s.titleLine1 !== undefined ? s.titleLine1 : defSlide.titleLine1,
          titleLine2: s.titleLine2 !== undefined ? s.titleLine2 : defSlide.titleLine2,
          subtitle: s.subtitle !== undefined ? s.subtitle : defSlide.subtitle,
          footerMain: s.footerMain || defSlide.footerMain || footerMain,
          footerSub: s.footerSub || defSlide.footerSub || footerSub,
          callouts:
            Array.isArray(s.callouts) && s.callouts.length >= 1
              ? [
                  s.callouts[0] || defSlide.callouts?.[0] || 'Geometria irregular',
                  s.callouts[1] || defSlide.callouts?.[1] || 'Ângulos difíceis',
                  s.callouts[2] || defSlide.callouts?.[2] || 'Múltiplos acessos',
                ]
              : defSlide.callouts,
          legendTitle1: s.legendTitle1 || defSlide.legendTitle1,
          legendDesc1: s.legendDesc1 || defSlide.legendDesc1,
          legendTitle2: s.legendTitle2 || defSlide.legendTitle2,
          legendDesc2: s.legendDesc2 || defSlide.legendDesc2,
          detailHeading: s.detailHeading || defSlide.detailHeading,
          detailBody: s.detailBody || defSlide.detailBody,
        }
      })

      return {
        reply:
          parsed.reply ||
          (existingSpec
            ? `Alterações aplicadas com sucesso no carrossel!`
            : `Carrossel Editorial de 5 páginas ("${brandName} - ${brandTagline}") criado com camadas vetoriais, setas de callout e zoom técnico!`),
        designSpec: {
          theme: brandTagline,
          mood: 'Editorial Arquitetônico',
          brandName,
          brandTagline,
          headline: `${slides[1]?.titleLine1 || ''} ${slides[1]?.titleLine2 || ''}`.trim(),
          subtitle: slides[1]?.subtitle || '',
          badgeText: kicker,
          ctaText: footerMain,
          layoutStyle: 'editorial' as DesignLayoutStyle,
          fontFamily: 'Montserrat',
          suggestedImagePrompt:
            parsed.suggestedImagePrompt || baseSpec.suggestedImagePrompt,
          slides: isCarousel ? slides : undefined,
        },
      }
    } catch {
      return null
    }
  }

  public buildRichEditorialFallback(command: string, isCarousel = true) {
    const cleanTopic = command.trim()
    const isArch = !cleanTopic || /arquitet|planta|clinica|clínica|pipa|interiores|espaço|consultório/i.test(cleanTopic)

    const brandName = isArch ? 'PiPa' : cleanTopic.split(' ')[0]?.slice(0, 10) || 'Studio'
    const brandTagline = isArch ? 'ARQUITETURA' : 'DESIGN & ESTRATÉGIA'
    const kicker = isArch ? 'ARQUITETURA A FAVOR DA SAÚDE' : 'PROJETO EM DESTAQUE'
    const footerMain = isArch ? 'ESPAÇOS BEM PENSADOS' : 'EXCELÊNCIA EM CADA DETALHE'
    const footerSub = isArch ? 'PARA CUIDAR DE PESSOAS' : 'RESULTADOS QUE TRANSFORMAM'

    const slides: EditorialSlideSpec[] = [
      {
        slideType: 'cover',
        kicker,
        sideTag: 'ESTUDO DE CASO',
        titleLine1: brandName,
        titleLine2: brandTagline,
        subtitle: 'Projeto completo com soluções técnicas e estética refinada.',
        footerMain,
        footerSub,
      },
      {
        slideType: 'challenge',
        kicker,
        sideTag: 'LEVANTAMENTO\nDO ESPAÇO\nEXISTENTE',
        titleLine1: 'O espaço',
        titleLine2: 'original:',
        subtitle: '3 ângulos difíceis, circulação truncada\ne a necessidade de atender\nàs normas técnicas.',
        footerMain: 'UM PONTO DE PARTIDA REAL',
        footerSub: 'PARA UM NOVO CUIDADO',
        callouts: ['Geometria\nirregular', 'Ângulos\ndifíceis', 'Múltiplos\nacessos'],
      },
      {
        slideType: 'opportunity',
        kicker,
        sideTag: 'ARQUITETURA\nA FAVOR\nDA SAÚDE',
        titleLine1: 'Planta irregular é',
        titleLine2: 'problema ou\noportunidade?',
        subtitle: 'Neste projeto, as paredes chanfradas\nse transformam em uma clínica completa,\nfuncional e acolhedora.',
        footerMain,
        footerSub,
      },
      {
        slideType: 'solution',
        kicker,
        sideTag: 'ARQUITETURA\nA FAVOR\nDA SAÚDE',
        titleLine1: 'Aqui está',
        titleLine2: 'a solução!',
        subtitle: 'Distribuição inteligente: 2 consultórios principais, sala\nde procedimentos, orçamentos e recepção fluida.\nCada metro quadrado aproveitado.',
        footerMain,
        footerSub,
      },
      {
        slideType: 'detail',
        kicker: 'FOCO NO DETALHE',
        sideTag: 'ARQUITETURA\nA FAVOR\nDA SAÚDE',
        titleLine1: 'Área técnica',
        titleLine2: 'e circulação',
        subtitle: 'ORGANIZAÇÃO QUE FAZ\nA DIFERENÇA NO ATENDIMENTO',
        footerMain,
        footerSub,
        legendTitle1: 'Fluxo limpo',
        legendDesc1: 'Pacientes e atendimento',
        legendTitle2: 'Fluxo sujo',
        legendDesc2: 'Materiais e resíduos',
        detailHeading: 'Arquitetura para\nsaúde exige rigor:',
        detailBody: 'fluxo limpo x fluxo sujo e\nconforto tanto para o\npaciente quanto\npara a equipe.',
      },
    ]

    return {
      reply:
        'Carrossel Editorial de 5 páginas criado no padrão Pipa Arquitetura (Capa com Sombra Botânica, O Desafio com Setas Curvas, Oportunidade, A Solução e Detalhamento Técnico com Zoom Picture-in-Picture)!',
      designSpec: {
        theme: brandTagline,
        mood: 'Editorial Arquitetônico',
        brandName,
        brandTagline,
        headline: 'O espaço original:',
        subtitle: slides[1].subtitle,
        badgeText: kicker,
        ctaText: footerMain,
        layoutStyle: 'editorial' as DesignLayoutStyle,
        fontFamily: 'Montserrat',
        suggestedImagePrompt:
          'Top-down architectural floor plan render of a modern medical clinic interior, warm wood flooring, plants, furniture layout, clean minimalist presentation, 8k',
        slides: isCarousel ? slides : undefined,
      },
    }
  }

  /**
   * Understands a freehand drawing (sketch image + geometric descriptors + optional user hint)
   * and returns both a perfected vector shape/SVG and a detailed ComfyUI image generation prompt.
   */
  async understandSketch(
    sketchDataUrl: string,
    geometrySummary: {
      inferredShape: SketchVectorType
      isClosed: boolean
      aspectRatio: number
      strokeCount: number
      pointCount: number
    },
    userHint = ''
  ): Promise<SketchUnderstandingResult> {
    const fallback = this.buildSketchFallback(geometrySummary, userHint)

    const systemPrompt = `Você é um especialista em Visão Computacional e Design Vetorial (Magic Draw).
Sua função é analisar o rascunho/desenho feito à mão livre pelo usuário e identificar o que ele desenhou, retornando:
1. "meaning": Nome claro em português do que o desenho representa (ex: "Estrela de 5 Pontas", "Casa / Fachada Arquitetônica", "Coração", "Seta Direcional", "Árvore Botânica", "Círculo / Sol").
2. "explanation": Breve frase em português explicando a interpretação do traço.
3. "vectorType": Uma das categorias vetoriais exatas: "circle" | "rect" | "triangle" | "star" | "heart" | "hexagon" | "diamond" | "arrow" | "line" | "house" | "tree" | "cloud" | "check" | "sun" | "custom-svg".
4. "svgPath": (Opcional) Se "vectorType" for "custom-svg", forneça um comando SVG Path ("M ... Z") limpo e geométrico dentro de um viewBox 0 0 200 200.
5. "imagePrompt": Prompt detalhado em inglês para gerar uma imagem/ilustração realista de altíssima qualidade no ComfyUI (Z-Image-Turbo) representando esse objeto em fundo limpo.

Retorne APENAS um objeto JSON válido.`

    const userText = `Análise geométrica dos traços desenhados:
- Forma geométrica inferida pelos vértices: ${geometrySummary.inferredShape}
- Contorno fechado: ${geometrySummary.isClosed ? 'Sim' : 'Não'}
- Proporção (largura/altura): ${geometrySummary.aspectRatio.toFixed(2)}
- Quantidade de traços: ${geometrySummary.strokeCount} (${geometrySummary.pointCount} pontos)
${userHint.trim() ? `- Dica / intenção informada pelo usuário: "${userHint.trim()}"` : ''}

Identifique o significado do desenho e retorne o JSON para transformá-lo em vetor ou imagem.`

    // 1. Try multimodal vision request with the sketch image
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.selectedModel || undefined,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: sketchDataUrl } },
              ],
            },
          ],
          temperature: 0.3,
          max_tokens: 900,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const raw = this.extractMessageContent(data.choices?.[0])
        const parsed = this.parseSketchJson(raw, fallback)
        if (parsed) return parsed
      }
    } catch {}

    // 2. Fallback to text completion using geometric analysis + user hint
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.selectedModel || undefined,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          temperature: 0.3,
          max_tokens: 900,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const raw = this.extractMessageContent(data.choices?.[0])
        const parsed = this.parseSketchJson(raw, fallback)
        if (parsed) return parsed
      }
    } catch {}

    return fallback
  }

  private parseSketchJson(raw: string, fallback: SketchUnderstandingResult): SketchUnderstandingResult | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return null
      const parsed = JSON.parse(match[0])
      const validTypes: SketchVectorType[] = [
        'circle',
        'rect',
        'triangle',
        'star',
        'heart',
        'hexagon',
        'diamond',
        'arrow',
        'line',
        'house',
        'tree',
        'cloud',
        'check',
        'sun',
        'custom-svg',
      ]
      const vType: SketchVectorType = validTypes.includes(parsed.vectorType)
        ? parsed.vectorType
        : fallback.vectorType

      return {
        meaning: parsed.meaning || fallback.meaning,
        explanation: parsed.explanation || fallback.explanation,
        vectorType: vType,
        svgPath: typeof parsed.svgPath === 'string' && parsed.svgPath.trim().startsWith('M') ? parsed.svgPath.trim() : undefined,
        imagePrompt: parsed.imagePrompt || fallback.imagePrompt,
      }
    } catch {
      return null
    }
  }

  private buildSketchFallback(
    geo: {
      inferredShape: SketchVectorType
      isClosed: boolean
      aspectRatio: number
      strokeCount: number
      pointCount: number
    },
    userHint = ''
  ): SketchUnderstandingResult {
    const h = userHint.toLowerCase().trim()
    let vType: SketchVectorType = geo.inferredShape

    if (h) {
      if (/casa|arquitet|planta|pr[eé]dio|teto/.test(h)) vType = 'house'
      else if (/estrela|star|brilho/.test(h)) vType = 'star'
      else if (/cora[cç][aã]o|amor|heart/.test(h)) vType = 'heart'
      else if (/seta|arrow|dire[cç][aã]o|fluxo/.test(h)) vType = 'arrow'
      else if (/[aá]rvore|planta|folha|bot[aâ]nic/.test(h)) vType = 'tree'
      else if (/nuvem|cloud/.test(h)) vType = 'cloud'
      else if (/sol|sun|luz/.test(h)) vType = 'sun'
      else if (/check|certo|visto|ok/.test(h)) vType = 'check'
      else if (/tri[aâ]ngulo|pir[aâ]mide/.test(h)) vType = 'triangle'
      else if (/c[ií]rculo|bola|redondo|roda/.test(h)) vType = 'circle'
      else if (/quadrado|ret[aâ]ngulo|caixa|moldura/.test(h)) vType = 'rect'
      else if (/losango|diamante|diamond/.test(h)) vType = 'diamond'
      else if (/hex[aá]gono/.test(h)) vType = 'hexagon'
      else if (/linha|tra[cç]o/.test(h)) vType = 'line'
    }

    const catalog: Record<
      SketchVectorType,
      { meaning: string; explanation: string; prompt: string }
    > = {
      circle: {
        meaning: 'Círculo / Forma Orgânica Circular',
        explanation: 'Contorno curvo fechado detectado com proporção equilibrada.',
        prompt: 'Minimalist modern 3D sphere and circular architectural sculpture, studio lighting, clean isolated background, 8k',
      },
      rect: {
        meaning: 'Retângulo / Moldura Geométrica',
        explanation: 'Traçado retangular com 4 lados bem definidos.',
        prompt: 'Clean modern architectural frame and minimalist rectangular structure, warm wood and stone texture, studio render, 8k',
      },
      triangle: {
        meaning: 'Triângulo / Forma Piramidal',
        explanation: 'Três vértices angulares detectados formando um triângulo.',
        prompt: 'Minimalist geometric prism and modern triangular architectural roof structure, clean studio lighting, 8k',
      },
      star: {
        meaning: 'Estrela de Destaque',
        explanation: 'Múltiplas pontas radiais identificadas no desenho à mão livre.',
        prompt: 'Golden metallic 3D star emblem, luxury studio lighting, soft shadows, clean neutral background, 8k',
      },
      heart: {
        meaning: 'Coração Simétrico',
        explanation: 'Duas curvas superiores convergindo em ponta inferior.',
        prompt: 'Artistic 3D sculpted heart icon, smooth matte finish, soft warm studio lighting, isolated on clean background, 8k',
      },
      hexagon: {
        meaning: 'Hexágono Geométrico',
        explanation: 'Polígono facetado de múltiplos lados detectado.',
        prompt: 'Modern hexagonal geometric architectural tile and 3D honeycomb structure, studio lighting, 8k',
      },
      diamond: {
        meaning: 'Losango / Diamante',
        explanation: 'Quatro vértices inclinados na diagonal.',
        prompt: 'Crystal clear faceted diamond gem, luxury studio lighting, clean minimalist background, 8k',
      },
      arrow: {
        meaning: 'Seta Direcional de Fluxo',
        explanation: 'Eixo direcional com ponta indicativa detectada.',
        prompt: 'Sleek 3D directional arrow icon, modern matte olive and gold finish, clean studio lighting, 8k',
      },
      line: {
        meaning: 'Linha / Divisor Editorial',
        explanation: 'Traço linear alongado detectado.',
        prompt: 'Minimalist golden architectural divider bar, sleek metallic finish, studio light, 8k',
      },
      house: {
        meaning: 'Casa / Ícone Arquitetônico',
        explanation: 'Estrutura com base e telhado arquitetônico identificada.',
        prompt: 'Modern contemporary architectural house facade, warm wood and concrete, minimalist luxury design, daylight studio render, 8k',
      },
      tree: {
        meaning: 'Árvore / Elemento Botânico',
        explanation: 'Copa orgânica e estrutura botânica detectadas.',
        prompt: 'Indoor architectural olive tree plant in a minimalist ceramic pot, soft natural sunlight, clean background, 8k',
      },
      cloud: {
        meaning: 'Nuvem Orgânica',
        explanation: 'Contorno suave com arcos arredondados.',
        prompt: 'Soft volumetric 3D cloud icon, gentle studio lighting, minimalist clean aesthetic, 8k',
      },
      check: {
        meaning: 'Símbolo de Confirmação (Check)',
        explanation: 'Traço em V ascendente característico de aprovação.',
        prompt: '3D emerald green checkmark icon, smooth glossy finish, studio lighting, clean background, 8k',
      },
      sun: {
        meaning: 'Sol / Iluminação Natural',
        explanation: 'Núcleo central com raios ao redor.',
        prompt: 'Warm golden sun emblem, minimalist modern boho aesthetic, studio lighting, 8k',
      },
      'custom-svg': {
        meaning: userHint || 'Elemento Gráfico Personalizado',
        explanation: 'Desenho interpretado a partir dos traços livres e contexto.',
        prompt: `${userHint || 'Modern minimalist graphic design object'}, high quality studio photography, clean background, 8k`,
      },
    }

    const chosen = catalog[vType] || catalog.circle
    return {
      meaning: userHint.trim() ? `${chosen.meaning} (${userHint.trim()})` : chosen.meaning,
      explanation: chosen.explanation,
      vectorType: vType,
      imagePrompt: userHint.trim()
        ? `${userHint.trim()}, hyperrealistic studio render, clean minimalist background, sharp focus, 8k`
        : chosen.prompt,
    }
  }
}

export const lmStudioService = new LMStudioService()
