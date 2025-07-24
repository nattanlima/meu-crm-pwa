// Define um nome e versão para o cache
const CACHE_NAME = 'prisme-crm-cache-v1';

// Lista de URLs e recursos essenciais para o funcionamento offline
const urlsToCache = [
  '.', // A raiz, ou seja, o index.html
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.quilljs.com/1.3.6/quill.snow.css',
  'https://cdn.quilljs.com/1.3.6/quill.min.js',
  'https://crm.prismeapp.com.br/web/binary/company_logo'
];

// Evento 'install': é disparado quando o Service Worker é instalado
self.addEventListener('install', event => {
  // Espera até que o cache seja aberto e todos os recursos sejam armazenados
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento 'fetch': é disparado para cada requisição feita pela página
self.addEventListener('fetch', event => {
  // Não faz cache de requisições para a API do Google/Supabase, sempre busca na rede
  if (event.request.url.startsWith('https://script.google.com') || event.request.url.includes('supabase.co')) {
    return fetch(event.request);
  }

  // Para todas as outras requisições, responde com a estratégia "cache-first"
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o recurso for encontrado no cache, retorna ele
        if (response) {
          return response;
        }
        // Se não, faz a requisição na rede
        return fetch(event.request);
      })
  );
});
