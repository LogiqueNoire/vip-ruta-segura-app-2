'use strict';

// Pestañas y sheet IDs del libro de Google Sheets.
// Los archivos y sus referencias permanecen fuera de esta capa.
const HOJAS = Object.freeze({
  usuarios: 'usuarios',
  codigosCorreo: 'codigos_correo',
  viajes: 'viajes',
  reservas: 'reservas',
  asientosReserva: 'asientos_reserva',
  pagos: 'pagos',
  resenas: 'resenas',
  incidentes: 'incidentes',
  ubicacionesEnVivo: 'ubicaciones_en_vivo'
});

const GIDS = Object.freeze({
  usuarios: 0,
  codigos_correo: 1940336707,
  viajes: 1230547018,
  reservas: 1656189283,
  asientos_reserva: 2021609011,
  pagos: 1514281011,
  resenas: 1557130465,
  incidentes: 1198015377,
  ubicaciones_en_vivo: 651696487
});

module.exports = { HOJAS, GIDS };
