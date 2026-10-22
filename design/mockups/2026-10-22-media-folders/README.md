# Carpetas de medios

Lámina anterior a la UI; usa los tokens vigentes y nombres reales. Carpetas planas; en móvil la columna se convierte en controles apilados.

| Eje                   | Estado       | Evidencia prevista                                                   |
| --------------------- | ------------ | -------------------------------------------------------------------- |
| Tokens                | Cubierto     | Temas generados, sin colores nuevos                                  |
| Componentes y estados | Cubierto     | Columna, selector, creación, renombrado, borrado y fallos parciales  |
| Responsive            | Cubierto     | 200 px lateral; apilado bajo 640 px                                  |
| Accesibilidad         | Cubierto     | Controles nativos, foco visible, etiquetas y anuncio de resultado    |
| Contenido y límites   | Cubierto     | Nombres largos, vacío, duplicado, carpeta desaparecida               |
| Feedback              | Cubierto     | Carga, reintento, recuento antes de borrar, conservación de archivos |
| Assets                | No aplicable | Las miniaturas existentes siguen resolviéndose con el puerto         |

El E2E comprueba a 390 × 844 px el ancho de documento sin desbordamiento y las cajas de selector, Renombrar y Borrar (mínimo 44 × 44 px). Guarda capturas de las acciones móviles y del resultado tras borrar. Las medidas y resultados efectivos viven en el recibo del candidato.
