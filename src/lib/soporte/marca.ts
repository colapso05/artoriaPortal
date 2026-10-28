/**
 * Marca que se muestra en el chat de soporte.
 *
 * El cliente no debe ver "Artoria" ni "Arto": para él está hablando con su
 * proveedor de internet. Como la misma pantalla se va a servir desde el dominio
 * de cada empresa, la identidad vive acá y no repartida por los componentes.
 */
export interface Marca {
  nombre: string;
  /** Archivo en public/marcas/. Si no carga, se muestra la inicial del nombre. */
  logo: string;
}

export const MARCA: Marca = {
  nombre: "Dropp",
  logo: "/marcas/dropp.png",
};
