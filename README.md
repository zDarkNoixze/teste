# Anatomia 458 — Ferrari 458 Spider em 3D

Site interativo em Three.js: uma Ferrari 458 Spider aparece no início e, conforme você rola a página, a câmera orbita e o carro é desmontado peça por peça até a vista explodida final.

## Rodando

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm build     # gera dist/
```

## Como funciona

- `public/models/ferrari.glb` — modelo real (Draco). A carroceria vem como poucas malhas grandes; `src/car.js` as divide em componentes conectados e reagrupa cada componente por posição (`classify`) em peças reais: capô, tampa do motor, portas com retrovisor, para-lamas, painéis traseiros, para-choques, faróis, lanternas, bancos, painel, console e volante.
- O modelo não tem mecânica, então motor V8, câmbio, radiadores, suspensão, pinças e escape são modelados em código no mesmo arquivo.
- Cada peça declara `moves`: faixas de progresso do scroll (`S(capítulo, a, b)`), deslocamento e rotação.
- `src/main.js` — iluminação HDRI, sombras, bloom, câmera orbital com um keyframe por capítulo, hover com BVH (`three-mesh-bvh`) e troca de cor da pintura.
- `index.html` — os 8 capítulos (100vh cada). Para adicionar um capítulo: crie a seção, aumente `SECTIONS` e inclua um keyframe em `KEYS`.

## Créditos

- Modelo “Ferrari 458 Italia” por [vicent091036](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6), licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), distribuído com os exemplos do three.js. Alterado: dividido em peças, materiais ajustados e mecânica adicionada.
- HDRI “Studio Small 09” por Sergej Majboroda, [Poly Haven](https://polyhaven.com/a/studio_small_09) (CC0).
- Projeto não oficial, sem vínculo com a Ferrari S.p.A. “Ferrari” e “458” são marcas de seus respectivos donos.
