// Serve the OCR language data under a file name every static host accepts.
(function () {
  var f = self.fetch.bind(self);
  self.fetch = function (u, o) {
    return f(String(u).replace(/eng\.traineddata\.gz$/, 'eng-traineddata.wasm'), o);
  };
  importScripts('worker.min.js');
})();
