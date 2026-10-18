import { reportClientError } from "./lib/error-reporting";
window.addEventListener(
  "error",
  (event: Event) => {
    if (event instanceof ErrorEvent) reportClientError("runtime");
    else if (
      event.target instanceof HTMLScriptElement ||
      event.target instanceof HTMLLinkElement
    )
      reportClientError("asset");
  },
  true,
);
window.addEventListener("unhandledrejection", () =>
  reportClientError("promise"),
);
