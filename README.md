# Portfólio X1 — placa-mãe 3D interativa

Portfólio em Three.js no formato de uma placa-mãe. A página abre com uma tela de BIOS (POST) e mostra a placa com os componentes flutuando. Conforme você rola, cada peça se encaixa no lugar e a seção correspondente aparece:

| Seção | Componente | Conteúdo |
| --- | --- | --- |
| 01 | Processador | Informações pessoais (nome, e-mail com botão de copiar, local, status, ficha técnica expansível, links) |
| 02 | Memória RAM | 4 projetos, um por pente: imagem, descrição, tópicos, stack, métricas e links em uma janela própria |
| 03 | Placa de vídeo | Habilidades (barras de “% de uso”) |
| 04 | SSD M.2 | Experiência e formação (linha do tempo) |
| 05 | Painel de I/O | Contato (e-mail, formulário via `mailto`, redes) |

Também dá para passar o mouse sobre qualquer peça para ver o nome e a especificação, e clicar nela: componentes principais levam à seção correspondente, pentes de RAM abrem o projeto e as demais peças abrem o “inspetor”.

## Rodando

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm build     # gera dist/
```

## Personalizando

### Pelo editor: `/config`

Com o servidor rodando (`pnpm dev` ou o link de preview), acesse **`/config`** — por exemplo `http://localhost:5173/config`.

- Abas **Perfil** (CPU), **Projetos** (RAM), **Habilidades** (GPU) e **Experiência** (SSD).
- Tudo é salvo sozinho em `content/site.json`, e qualquer aba aberta do site recarrega na hora. O editor tem o site ao vivo ao lado, que acompanha a seção ou o projeto que você está editando.
- Imagens dos projetos: botão **Enviar imagem**, arrastar e soltar, ou colar uma URL. Fotos grandes são reduzidas para 1920 px antes do envio. Os envios vão para `public/uploads/`.
- Até 4 projetos (um por slot de memória da placa). Dá para reordenar, adicionar e remover.
- **Baixar JSON** exporta o conteúdo; **Desfazer sessão** volta ao estado de quando a página foi aberta.

O editor só existe no servidor de desenvolvimento: o `pnpm build` gera apenas o site, com o conteúdo de `content/site.json` embutido. Quem tiver o link do preview também consegue abrir o `/config`.

### Direto no arquivo

Edite `content/site.json`. Os campos são validados por `src/content.js` (links só `http(s)`, `mailto` e `tel`; cores em `#rrggbb`).

## Desempenho e compatibilidade

O site se adapta ao aparelho em vez de exigir um aparelho bom (`src/quality.js`):

| Nível | Quem recebe | O que muda |
| --- | --- | --- |
| **alto** | PCs e celulares topo de linha | resolução até 2×, MSAA 4×, bloom, sombras 2K, HDR completo (1,6 MB) |
| **médio** | celulares e notebooks comuns | resolução até 1,5×, MSAA 2×, bloom em meia resolução, sombras 1K, HDR reduzido (410 KB), menos componentes miniatura |
| **baixo** | GPUs antigas, pouca memória | sem pós-processamento, sem sombras, luz procedural (sem download), texturas menores, sem desfoque nos cards |
| **leve** | sem WebGL2 (ex.: iPhone até iOS 14), renderização por software, economia de dados | sem 3D: imagens pré-renderizadas da placa com “câmera” em CSS, mesmo conteúdo e mesmas janelas de projeto |

- **Download em partes:** a página (≈ 11 KB gzip) carrega primeiro; o 3D (≈ 165 KB gzip) só é baixado se o aparelho for usá-lo.
- **Regulador em tempo real:** se o FPS cair, a resolução baixa em etapas; depois saem bloom e sombras; abaixo de ~20 fps o site troca para o modo leve e lembra disso por 14 dias. Também troca se o navegador derrubar o contexto WebGL.
- **Economia contínua:** sombras só são recalculadas quando algo se move, a seleção por mouse só roda quando o mouse ou a câmera mudam, e a cena reduz a taxa de quadros com a janela de projeto aberta ou com o visitante parado.
- **Navegadores antigos:** um pacote separado (ES2015 + polyfills, via `@vitejs/plugin-legacy`) é baixado apenas por navegadores sem suporte a módulos modernos — até iOS 10 (iPhone 5, 2012) e Chrome 49. O CSS ganha prefixos e alternativas automaticamente, e há alternativa para `<dialog>`.
- O botão **Modo leve / Ativar 3D** no canto inferior deixa o visitante escolher.
- Para testar um nível: `?q=high`, `?q=medium`, `?q=low` ou `?q=static`.

### Imagens do modo leve

`public/poster-hero.jpg`, `public/poster-board.jpg` e `public/poster.json` são renderizados pelo próprio 3D. Depois de mudar nome ou projetos, clique em **Atualizar versão leve** no `/config` para regenerá-los. O HDR reduzido sai de `node scripts/downsample-hdr.mjs public/hdr/studio.hdr public/hdr/studio-512.hdr`.

## Estrutura

- `src/board/pcb.js` — layout da placa, roteamento das trilhas, textura da PCB e os pulsos de dados animados (shader).
- `src/board/board.js` — todos os componentes 3D e as animações de encaixe.
- `src/main.js` — página, scroll, HUD, janela de projeto e o modo leve; decide se carrega o 3D.
- `src/quality.js` — detecção do nível de qualidade.
- `src/scene/index.js` — cena 3D, níveis de qualidade, regulador de FPS, câmera e interação.
- `src/ui.js` — painéis, janela de projeto, tela de BIOS e efeito de texto.
- `content/site.json` — o conteúdo; `src/content.js` valida e `src/data.js` carrega.
- `config.html`, `src/config/` — o editor `/config`; `config-api.js` — API de salvar/enviar imagens (só em `pnpm dev`).

Projetos, empresas e números de exemplo em `content/site.json` são fictícios.

## Créditos

HDRI “Studio Small 09” por Sergej Majboroda, [Poly Haven](https://polyhaven.com/a/studio_small_09) (CC0).
