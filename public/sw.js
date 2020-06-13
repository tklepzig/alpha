var CACHE_NAME = "alpha-cache-2020-06-13";
var urlsToCache = [
  "/",
  "/index.html",
  "manifest.json",
  "/style.css",
  "/sw.js",
  "/components/ConnectionIndicator.js",
  "/common.js",
  "/app.js",
  "https://fonts.googleapis.com/css?family=Open+Sans",
  "https://cdn.jsdelivr.net/npm/vue@2.6.11/dist/vue.esm.browser.js",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }

      return fetch(event.request).then(function (response) {
        if (
          !response ||
          response.status !== 200 ||
          (response.type !== "basic" && response.type !== "cors")
        ) {
          return response;
        }

        // Do not cache newly created requests which are not listed above
        //var responseToCache = response.clone();
        //caches.open(CACHE_NAME).then(function(cache) {
        //cache.put(event.request, responseToCache);
        //});

        return response;
      });
    })
  );
});
