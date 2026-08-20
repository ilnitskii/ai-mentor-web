export function registerServiceWorker(): void {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    });
  }
}
