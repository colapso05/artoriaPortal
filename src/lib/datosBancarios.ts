/**
 * Datos de la cuenta a la que se transfiere para cargar saldo.
 *
 * Viven en un solo lugar porque se muestran en dos pantallas (Créditos y la
 * tarjeta de saldo del inicio): si cambian, que no haya una copia olvidada con
 * la cuenta vieja.
 */
export const BANK_DETAILS = [
  { label: "Nombre",          value: "DEMIS ALEJANDRO ZUNIGA" },
  { label: "RUT",             value: "21.311.925-7" },
  { label: "Banco",           value: "Banco BCI" },
  { label: "Tipo de cuenta",  value: "Cuenta Corriente" },
  { label: "N° de cuenta",    value: "50458931" },
];
