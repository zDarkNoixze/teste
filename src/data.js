/*
 * Tudo o que aparece no portfólio sai daqui. Troque os textos, links e imagens
 * (em public/projects/) pelos seus — o resto do site se ajusta sozinho.
 */

export const profile = {
  name: 'Cris Brown',
  role: 'Dev Full-stack & Creative Developer',
  location: 'São Paulo, Brasil',
  email: 'voce@seudominio.com',
  phone: '+55 11 90000-0000',
  site: 'seudominio.com',
  availability: 'Disponível para novos projetos',
  bio:
    'Construo produtos digitais que unem engenharia sólida e interfaces memoráveis — de dashboards em tempo real a experiências 3D no navegador.',
  links: [
    { label: 'GitHub', url: 'https://github.com/seu-usuario' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/seu-usuario' },
    { label: 'Dribbble', url: 'https://dribbble.com/seu-usuario' },
  ],
  // "Ficha técnica" do processador
  specs: [
    ['Modelo', 'X1 · Cris Brown'],
    ['Arquitetura', 'Front-end · Back-end · 3D'],
    ['Núcleos', '8 competências principais'],
    ['Clock base', '6 anos de experiência'],
    ['Turbo', 'Prazos apertados'],
    ['Cache L3', '40+ projetos entregues'],
    ['Idiomas', 'PT · EN · ES'],
    ['TDP', '100% dedicação'],
  ],
};

export const projects = [
  {
    id: 'pulse',
    slot: 'DIMM_A1',
    title: 'Pulse Analytics',
    tagline: 'Dashboard SaaS de métricas em tempo real',
    year: '2025',
    role: 'Lead Front-end',
    color: '#22d3ee',
    image: 'projects/pulse.svg',
    description:
      'Plataforma que transforma milhões de eventos por minuto em painéis legíveis. Redesenhei a arquitetura do front-end para streaming de dados e criei uma biblioteca de gráficos própria, leve e acessível.',
    topics: [
      'Streaming de eventos via WebSockets com reconexão e backpressure',
      'Biblioteca de gráficos em D3 + Canvas renderizando 60 fps com 100 mil pontos',
      'Design system com 48 componentes documentados no Storybook',
      'Testes visuais automatizados em cada pull request',
    ],
    stack: ['React', 'TypeScript', 'D3.js', 'WebSockets', 'Node.js', 'Storybook'],
    metrics: [['-38%', 'tempo de carregamento'], ['60 fps', 'com 100k pontos'], ['4,8★', 'satisfação dos clientes']],
    links: { demo: '#', code: '#' },
  },
  {
    id: 'rota',
    slot: 'DIMM_A2',
    title: 'Rota Verde',
    tagline: 'App de caronas e mobilidade sustentável',
    year: '2024',
    role: 'Full-stack Mobile',
    color: '#4ade80',
    image: 'projects/rota.svg',
    description:
      'Aplicativo que conecta pessoas indo para o mesmo lugar e mostra quanto CO₂ cada viagem compartilhada economiza. Cuidei do app, da API e do algoritmo de pareamento de rotas.',
    topics: [
      'Pareamento de rotas com PostGIS e janelas de horário',
      'Mapa em tempo real com Mapbox e rastreamento em segundo plano',
      'Gamificação: metas de CO₂, conquistas e ranking por empresa',
      'Publicado na App Store e Google Play com 99,7% de sessões sem falhas',
    ],
    stack: ['React Native', 'Expo', 'Mapbox', 'PostgreSQL', 'PostGIS', 'Firebase'],
    metrics: [['32 mil', 'usuários ativos'], ['210 t', 'de CO₂ evitadas'], ['99,7%', 'sessões sem falhas']],
    links: { demo: '#', code: '#' },
  },
  {
    id: 'atelier',
    slot: 'DIMM_B1',
    title: 'Atelier Store',
    tagline: 'E-commerce headless para uma marca de moda autoral',
    year: '2024',
    role: 'Front-end & Performance',
    color: '#f472b6',
    image: 'projects/atelier.svg',
    description:
      'Loja headless com catálogo editorial, provador de looks e checkout em uma etapa. O foco foi velocidade: páginas geradas na borda e imagens otimizadas por dispositivo.',
    topics: [
      'Next.js com renderização na borda e cache por coleção',
      'Monte seu look: combina peças e mostra o preço do conjunto',
      'Checkout em uma etapa com Stripe e Pix',
      'Core Web Vitals no verde em 100% das páginas',
    ],
    stack: ['Next.js', 'Shopify Storefront', 'Stripe', 'Tailwind CSS', 'Vercel'],
    metrics: [['+27%', 'conversão'], ['0,9 s', 'LCP médio'], ['98', 'nota no Lighthouse']],
    links: { demo: '#', code: '#' },
  },
  {
    id: 'nebula',
    slot: 'DIMM_B2',
    title: 'Nebula 3D',
    tagline: 'Configurador 3D interativo no navegador',
    year: '2023',
    role: 'Creative Developer',
    color: '#a78bfa',
    image: 'projects/nebula.svg',
    description:
      'Experiência WebGL em que o cliente monta e personaliza um produto peça por peça, com materiais realistas, animações de câmera e exportação de um resumo do pedido.',
    topics: [
      'Cena em Three.js com materiais PBR e iluminação HDRI',
      'Shaders GLSL próprios para tecidos e metais escovados',
      'Animações de câmera coreografadas com GSAP',
      'Modo AR no celular com o mesmo modelo 3D',
    ],
    stack: ['Three.js', 'GLSL', 'GSAP', 'Blender', 'WebXR'],
    metrics: [['3 min', 'tempo médio de sessão'], ['-45%', 'devoluções'], ['12', 'materiais configuráveis']],
    links: { demo: '#', code: '#' },
  },
];

// Placa de vídeo: habilidades, em "% de uso"
export const skills = [
  { group: 'Front-end', items: [['React / Next.js', 95], ['TypeScript', 92], ['CSS & animações', 94], ['Acessibilidade', 85]] },
  { group: 'Gráficos & 3D', items: [['Three.js / WebGL', 88], ['GLSL', 76], ['Blender', 62]] },
  { group: 'Back-end & infra', items: [['Node.js', 86], ['PostgreSQL', 78], ['GraphQL', 74], ['Docker / CI', 72]] },
];

// SSD: experiência, do mais recente ao mais antigo
export const experience = [
  {
    period: '2023 — hoje',
    title: 'Senior Creative Developer',
    org: 'Estúdio Exemplo',
    text: 'Experiências 3D e sites premiados para marcas globais. Lidero um time de 4 devs.',
    tags: ['Three.js', 'Next.js', 'Liderança'],
  },
  {
    period: '2021 — 2023',
    title: 'Front-end Engineer',
    org: 'Fintech Exemplo',
    text: 'Dashboards de investimento em tempo real e o design system da empresa.',
    tags: ['React', 'TypeScript', 'Design system'],
  },
  {
    period: '2019 — 2021',
    title: 'Dev Full-stack',
    org: 'Agência Exemplo',
    text: 'Sites, e-commerces e APIs para mais de 20 clientes.',
    tags: ['Node.js', 'PostgreSQL', 'E-commerce'],
  },
  {
    period: '2015 — 2019',
    title: 'Ciência da Computação',
    org: 'Universidade Exemplo',
    text: 'Bacharelado com TCC sobre renderização em tempo real na web.',
    tags: ['Formação'],
  },
];
