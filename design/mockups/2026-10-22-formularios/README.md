# Formularios

Lámina creada antes del asistente, dentro del sistema vigente de Base del sitio.

- **Tokens — cubierto.** Roles existentes de color, tipografía, bordes y escala de espacio.
- **Componentes y estados — cubierto.** Edición, carga, preflight, divergencia, adopción con
  diferencias de reglas, escritura, resultado con migración y error reintentable conservando
  escrituras parciales. AdminDialog aporta cierre, retorno y trampa de foco.
- **Responsive — cubierto.** Campos apilados, acciones envolventes y código con scroll propio.
  Chromium a 390 × 844 no desborda el viewport; controles de texto de 44 px y select de 44.34 px.
- **Accesibilidad — cubierto.** Etiquetas explícitas, foco visible, estado y alertas anunciados.
  Contraste de texto en controles medido: 17.96:1; mínimo comprobado 4.5:1.
- **Contenido y límites — cubierto.** Inscripciones, nombres reservados, consentimiento, cero
  obligatorio, campos de texto largos, opciones y límite por IP; ninguna definición en JSON.
- **Feedback — cubierto.** Preflight real, colección existente, diferencias de reglas, aviso de
  dependencia del servidor, migración y estado del límite. No se promete que el hook esté activo.
- **Assets — no aplicable.** Usa controles, iconos y tipografía ya disponibles.

El e2e recorre creación, migración, límite y bandeja vacía; también mide móvil y rechazo de un
campo reservado. Las capturas y `forms-mobile-metrics.json` viven en el git-common-dir, bajo
`verification/cms-seven-20261022/forms`. No acredita aquí todos los estados de servidor en navegador:
los contratos reales y las unidades comprueban preflight, envío, retención y límites por separado.
