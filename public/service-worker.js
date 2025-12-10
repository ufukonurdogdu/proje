const CACHE_NAME = 'netspor-pwa-v5';
const urlsToCache = [
    '/api/auth/login',
    '/manifest.json'
];

// ==================== INSTALL ====================
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker yükleniyor...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
});

// ==================== ACTIVATE ====================
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker aktif');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Eski cache siliniyor:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// ==================== FETCH ====================
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// ==================== PUSH BİLDİRİM ALMA ====================
self.addEventListener('push', (event) => {
    console.log('🔔 Push bildirim alındı:', event);
    
    let data = {
        title: 'netSPOR',
        body: 'Yeni bir bildiriminiz var',
        icon: '/uploads/logo-192.png',
        badge: '/uploads/logo-192.png',
        url: '/',
        type: 'genel'
    };

    // Gelen veriyi parse et
    if (event.data) {
        try {
            const jsonData = event.data.json();
            data = { ...data, ...jsonData };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    // Bildirim tipine göre URL belirle
    const tabMap = {
        'yoklama': '/veli/panel?tab=yoklama',
        'aidat': '/veli/panel?tab=aidat',
        'kasa': '/veli/panel?tab=aidat',
        'analiz': '/veli/panel?tab=analiz',
        'ders': '/veli/panel',
        'satis': '/veli/panel?tab=aidat',
        'ozel_ders': '/veli/panel'
    };

    // Eğer url belirtilmemişse type'a göre belirle
    if (data.type && tabMap[data.type] && data.url === '/') {
        data.url = tabMap[data.type];
    }

    const options = {
        body: data.body,
        icon: data.icon || '/uploads/logo-192.png',
        badge: data.badge || '/uploads/logo-192.png',
        vibrate: [200, 100, 200],
        tag: data.type || 'default',
        renotify: true,
        requireInteraction: false,
        silent: false,
        data: {
            url: data.url || '/',
            type: data.type || 'genel',
            dateOfArrival: Date.now()
        },
        actions: data.actions || []
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ==================== BİLDİRİME TIKLANDIĞINDA ====================
self.addEventListener('notificationclick', (event) => {
    console.log('👆 Bildirime tıklandı:', event);
    event.notification.close();

    const notificationData = event.notification.data || {};
    const urlToOpen = notificationData.url || '/';
    const notificationType = notificationData.type || 'genel';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // Veli paneli açık mı kontrol et
                for (const client of clientList) {
                    if (client.url.includes('/veli/') && 'focus' in client) {
                        // Açık pencereye mesaj gönder
                        client.postMessage({
                            action: 'openTab',
                            type: notificationType,
                            url: urlToOpen
                        });
                        return client.focus();
                    }
                }

                // Yönetici paneli açık mı kontrol et
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.navigate(urlToOpen);
                        return client.focus();
                    }
                }

                // Hiçbir pencere açık değilse yeni pencere aç
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// ==================== BİLDİRİM KAPANDIĞINDA ====================
self.addEventListener('notificationclose', (event) => {
    console.log('❌ Bildirim kapatıldı:', event.notification.tag);
});

// ==================== ABONELİK DEĞİŞTİĞİNDE ====================
self.addEventListener('pushsubscriptionchange', (event) => {
    console.log('🔄 Push aboneliği değişti:', event);
    
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription?.options?.applicationServerKey
        }).then((subscription) => {
            // Yeni aboneliği sunucuya gönder
            return fetch('/api/push/abone-ol', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subscription: subscription.toJSON(),
                    cihazTipi: 'web',
                    tarayici: 'ServiceWorker'
                })
            });
        }).catch((err) => {
            console.error('Re-subscription hatası:', err);
        })
    );
});

// ==================== MESAJ ALMA (Sayfa -> SW) ====================
self.addEventListener('message', (event) => {
    console.log('📨 SW mesaj aldı:', event.data);
    
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.action === 'getVersion') {
        event.ports[0].postMessage({ version: CACHE_NAME });
    }
});

// ==================== SYNC (Arka Plan Senkronizasyon) ====================
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync:', event.tag);
    
    if (event.tag === 'sync-data') {
        event.waitUntil(
            // Arka planda veri senkronizasyonu yapılabilir
            Promise.resolve()
        );
    }
});

// ==================== PERIODIC SYNC (Periyodik Senkronizasyon) ====================
self.addEventListener('periodicsync', (event) => {
    console.log('⏰ Periodic sync:', event.tag);
    
    if (event.tag === 'check-updates') {
        event.waitUntil(
            // Periyodik güncelleme kontrolü
            Promise.resolve()
        );
    }
});

console.log('🚀 Service Worker yüklendi - Version:', CACHE_NAME);