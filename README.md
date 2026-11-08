# VÉRTICE GT — Anatomia 3D

Site interativo em Three.js: um carro esportivo 3D aparece no início e, conforme você rola a página, a câmera se aproxima e o carro é desmontado peça por peça até a vista explodida final.

## Rodando

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm build     # gera dist/
```

## Como funciona

- `src/car.js` — o carro é modelado proceduralmente (sem arquivos .glb), com 49 peças independentes. Cada peça declara `moves`: faixas de progresso do scroll, deslocamento e rotação. `S(i, a, b)` devolve a janela de progresso do capítulo `i`.
- `src/main.js` — cena, iluminação, bloom, câmera com um keyframe por capítulo, scroll suavizado, hover com nome da peça e troca de cor da pintura.
- `index.html` — os 8 capítulos (cada um com 100vh). Para adicionar um capítulo, crie a seção, aumente `SECTIONS` e inclua um keyframe em `KEYS`.

Para usar um modelo real (.glb), basta carregá-lo com `GLTFLoader` e registrar cada malha como peça via a mesma estrutura `userData.moves`.
