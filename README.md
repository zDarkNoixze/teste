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
- Imagens dos projetos: botão **Enviar imagem**, arrastar e soltar, ou colar uma URL. Os envios vão para `public/uploads/`.
- Até 4 projetos (um por slot de memória da placa). Dá para reordenar, adicionar e remover.
- **Baixar JSON** exporta o conteúdo; **Desfazer sessão** volta ao estado de quando a página foi aberta.

O editor só existe no servidor de desenvolvimento: o `pnpm build` gera apenas o site, com o conteúdo de `content/site.json` embutido. Quem tiver o link do preview também consegue abrir o `/config`.

### Direto no arquivo

Edite `content/site.json`. Os campos são validados por `src/content.js` (links só `http(s)`, `mailto` e `tel`; cores em `#rrggbb`).

## Estrutura

- `src/board/pcb.js` — layout da placa, roteamento das trilhas, textura da PCB e os pulsos de dados animados (shader).
- `src/board/board.js` — todos os componentes 3D e as animações de encaixe.
- `src/main.js` — cena, câmera por seção, interação (hover/clique) e loop.
- `src/ui.js` — painéis, janela de projeto, tela de BIOS e efeito de texto.
- `content/site.json` — o conteúdo; `src/content.js` valida e `src/data.js` carrega.
- `config.html`, `src/config/` — o editor `/config`; `config-api.js` — API de salvar/enviar imagens (só em `pnpm dev`).

Projetos, empresas e números de exemplo em `content/site.json` são fictícios.

## Créditos

HDRI “Studio Small 09” por Sergej Majboroda, [Poly Haven](https://polyhaven.com/a/studio_small_09) (CC0).
