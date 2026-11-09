# 🎨 Canva Local AI

Editor de imagens e design gráfico estilo **Canva**, executado 100% no seu computador, com integração nativa às suas IAs locais (**ComfyUI** e **LM Studio**).

---

## ⚡ Como Rodar o Aplicativo

Basta dar dois cliques no arquivo:
```
iniciar_canva.bat
```
Ou rodar via terminal dentro da pasta do projeto:
```bash
npm run dev
```
O aplicativo abrirá automaticamente no seu navegador em: **`http://localhost:3001`**

---

## 🚀 Recursos Principais

### 📐 1. Canvas Interativo Estilo Canva
- **Carrosséis & Múltiplas Páginas:** Crie carrosséis para Instagram, posts sequenciais ou apresentações. Adicione páginas, duplique slides ou alterne entre eles na barra inferior mantendo todas as camadas e edições salvas independentemente.
- **Formatos Pré-definidos:** Post Quadrado (1080×1080), Stories/Reels (1080×1920), Retrato (1080×1350), Thumbnail YouTube (1280×720) e Full HD (1920×1080).
- **Tipografia:** Títulos, subtítulos, corpo, fontes modernas (Inter, Playfair, Montserrat, Roboto, etc.), alinhamentos, cores, negrito, itálico e sublinhado.
- **Elementos Vetoriais:** Formas geométricas (retângulos, círculos, botões em pílula), preenchimento e opacidade.
- **Gerenciador de Camadas:** Avançar, recuar, trazer para a frente, enviar para o fundo.
- **Histórico & Atalhos:**
  - `Ctrl + Z`: Desfazer
  - `Ctrl + Y`: Refazer
  - `Ctrl + D`: Duplicar elemento selecionado
  - `Delete`: Excluir elemento selecionado
- **Exportação:** Baixar em **PNG** (com suporte a fundo transparente), **JPG** ou **WebP**, com multiplicador de resolução (**1x, 2x Alta Definição ou 4x Ultra HD**).

---

### 🧠 2. Superpoderes de IA Local (ComfyUI)
Conexão em tempo real com seu ComfyUI (`127.0.0.1:8188`) e GPU RTX 3060:
- **🪄 Remover Fundo em 1 Clique:** Selecione qualquer imagem e clique em "Remover Fundo" para transformá-la em um adesivo/PNG transparente.
- **🖌️ Preenchimento Generativo (Inpainting):** Selecione uma foto, ative o pincel rosa neon, pinte sobre a área desejada, digite o que quer gerar/substituir e o ComfyUI renderiza a alteração diretamente no canvas.
- **🔍 Upscale 2x:** Aumente a resolução e nitidez de qualquer foto com super-resolução.
- **✨ Text-to-Image:** Digite uma ideia na barra lateral (com estilos Fotográfico, 3D Render, Anime, Cyberpunk) e insira o elemento gerado na arte.

---

### 💬 3. Inteligência de Linguagem & Copilot (LM Studio)
Conexão com seu LM Studio (`127.0.0.1:1234`):
- **👁️ IA Vision & Criação de Design por Imagem:** Forneça qualquer foto (produto, comida, flyer, arte ou fotografia) e a IA analisa visualmente o conteúdo, extrai a paleta de cores dominante, sugere títulos/slogans e monta o design completo no canvas automaticamente com 1 clique!
- **✨ Magic Write:** Redija títulos chamativos, slogans de produtos, frases de impacto, legendas para Instagram ou botões de Call To Action com um clique.
- **🪄 Turbinador de Prompts (Prompt Enhancer):** Clique no botão de varinha mágica durante o Inpainting para que o LM Studio transforme ideias simples em prompts detalhados e fotográficos em inglês para o ComfyUI.
- **🤖 Design Copilot:** Chat assistente na aba lateral para pedir dicas de paleta de cores, ideias de composição e harmonização visual.
