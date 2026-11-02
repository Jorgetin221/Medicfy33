// La campana del menú (AppNav) y la bandeja "Por autorizar" viven en
// componentes distintos: al decidir una solicitud, la bandeja avisa con
// este evento para que el contador se actualice sin recargar la página.
export const CUSTODIAN_REQUESTS_CHANGED_EVENT = "medicfy:custodian-requests-changed";

export function notifyCustodianRequestsChanged(): void {
  window.dispatchEvent(new Event(CUSTODIAN_REQUESTS_CHANGED_EVENT));
}
