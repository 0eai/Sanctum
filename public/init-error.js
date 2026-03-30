window.onerror = function (message) {
  alert("Error: " + message);
};
window.addEventListener('unhandledrejection', function (event) {
  alert("Promise Error: " + event.reason);
});
