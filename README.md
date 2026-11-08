# Anatomia 458 — Ferrari 458 Spider em 3D

Site interativo em Three.js: uma Ferrari 458 Spider aparece no início e, conforme você rola a página, a câmera orbita e o carro é desmontado peça por peça — cerca de 150 peças, do virabrequim ao último fio — até a vista explodida final. Tem som sintetizado em tempo real.

## Rodando

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm build     # gera dist/
```

## Estrutura

| Arquivo | O que faz |
| --- | --- |
| `src/car/model.js` | Divide as malhas do `ferrari.glb` em componentes conectados e os reagrupa por posição (`classify`) em peças reais: portas (casca, forro, retrovisor), bancos (encosto e assento), faróis, carpete, cluster… |
| `src/car/mechanics.js` | Mecânica modelada em código: suspensão por roda, direção, freios, V8 completo (pistões, bielas, virabrequim, comandos, bobinas, velas, injetores, admissão, acessórios), câmbio, arrefecimento, escape, combustível, subchassis. |
| `src/car/interior.js` | Pedaleira, tapetes, cintos, trilhos, ar-condicionado e dutos, airbag, borboletas. |
| `src/car/electrics.js` | Bateria, fusíveis e relés, ECUs, BCM, buzinas, chicotes fio a fio e o sistema de som (falantes, sub, amplificador, cabos). |
| `src/car/kit.js` | Utilitários de modelagem: chicotes trançados, cintos, alto-falantes, foles e o *batching* que funde as malhas de cada peça por material. |
| `src/car/timeline.js` | Capítulos (`S(capítulo, a, b)`), animação de desmontagem e materiais. |
| `src/audio.js` | Som 100% sintetizado (Web Audio): V8 flat-plane cujo giro acompanha a velocidade do scroll, estalos no corte, sons por tipo de peça ao soltar/encaixar, vento e partida. |
| `src/main.js` | Cena, luz HDRI, câmera orbital por capítulo, hover com BVH, HUD e controles. |

Cada peça é criada com `P(nome, categoria, pivô, movimentos, filhos, { info, count })`. Um movimento é `{ r: S(cap, início, fim), o: [dx, dy, dz], rot: [rx, ry, rz] }`; vários movimentos se somam (ex.: o alto-falante da porta acompanha a porta e depois se solta dela).

## Créditos

- Modelo “Ferrari 458 Italia” por [vicent091036](https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6), licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), distribuído com os exemplos do three.js. Alterado: dividido em peças, materiais ajustados e mecânica, elétrica e áudio adicionados.
- HDRI “Studio Small 09” por Sergej Majboroda, [Poly Haven](https://polyhaven.com/a/studio_small_09) (CC0).
- Projeto não oficial, sem vínculo com a Ferrari S.p.A. “Ferrari” e “458” são marcas de seus respectivos donos.
