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

- **Seus dados:** edite `src/data.js` (perfil, projetos, habilidades, experiência). O nome também é gravado no processador 3D e na tela de BIOS.
- **Imagens dos projetos:** troque os arquivos em `public/projects/` (qualquer imagem 16:10 funciona; ajuste o caminho em `image`).

## Estrutura

- `src/board/pcb.js` — layout da placa, roteamento das trilhas, textura da PCB e os pulsos de dados animados (shader).
- `src/board/board.js` — todos os componentes 3D e as animações de encaixe.
- `src/main.js` — cena, câmera por seção, interação (hover/clique) e loop.
- `src/ui.js` — painéis, janela de projeto, tela de BIOS e efeito de texto.

## Créditos

HDRI “Studio Small 09” por Sergej Majboroda, [Poly Haven](https://polyhaven.com/a/studio_small_09) (CC0). Projetos, empresas e números em `src/data.js` são exemplos fictícios.
