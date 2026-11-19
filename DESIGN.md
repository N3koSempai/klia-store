# Fuente de verdad de diseño

Referencia de diseño para toda la UI de Klia Store:

    /mnt/mmc-SD512_0xda6a0dfd-part1/Roots of UIUX Design/Book Digital.epub
    (también Book Digital.pdf y el .fig en la misma carpeta)

Es un libro de Creative Tim (UI/UX) con partes sobre retícula, tipografía,
color, sombras, botones, formularios, iconos y componentes (cards, FAQs,
wizards). Cuando haya que decidir algo de diseño en este repo, la respuesta sale
de ahí, no de la intuición.

## Reglas que se aplicaron al modal de instalación de .deb

Cada regla cita la sección del libro de la que sale.

- **Retícula de 8pt.** "Grid and Layout → For Desktop": todas las dimensiones
  deben ser múltiplos de 8 (16, 24, 32, 40); para texto, base de 4px. Aplicado:
  padding de sección 24px, separación entre bloques 8/16px, radios 8/12px.
- **Escala tipográfica.** "Typography → Type Scale": un conjunto fijo de tamaños
  y **nunca más de tres tamaños distintos dentro de una misma sección**. Aplicado:
  escala de 5 pasos (11 / 12 / 13 / 14 / 18px) y el nombre del paquete a 20px;
  antes había 18 tamaños distintos conviviendo en el mismo bloque.
- **Interlineado.** "Typography → Line Height and Line Length": para texto pequeño,
  alto de línea ≈ 1.6×. Aplicado a textos secundarios y a los bloques de salida
  cruda.
- **Alineación a la izquierda.** "Typography → Alignment": centrar solo vale para
  textos cortos. Los estados vacíos/de carga se centran; el contenido, no.
- **Nada de negro puro sobre oscuro.** "Colors → Why Pure Black Isn't Ideal": el
  contraste extremo produce halación. Aplicado: los bloques de salida cruda usan
  un tinte claro del fondo (`rgba(255,255,255,0.03)`) y texto al 75%, no negro
  puro con blanco puro.
- **Sombras core + cast.** "Shadows → Create Realism with Shadows": una sola capa
  de sombra se ve plana; se combinan una sombra de contacto corta y una difusa
  amplia. Aplicado al diálogo: `0 1px 2px` + `0 16px 40px`. En modo oscuro nunca
  sombra blanca ("Shadows in Dark Mode").
- **Sombra interior para regiones de contenido.** "Shadows → Inner Shadow": la
  sombra interior comunica que algo está embebido. Aplicado a los bloques de
  salida cruda, que son regiones con scroll, no controles.
- **Objetivos táctiles.** "Buttons → How to set Button Sizes": mínimo 36×36
  (Material) / 40×40 (Apple). Aplicado: los botones de acción y de expansión
  tienen `minHeight: 36`; antes los de expansión medían ~22px.
- **Jerarquía y estados de botón.** "Buttons → Designing Button Variations",
  "Button Roles and Functions", "Button States": primario/secundario/terciario con
  radio, tipografía y sombra comunes; estado de progreso cuando la acción no es
  inmediata; color semántico (azul info, verde éxito, amarillo aviso, rojo error).
- **Peso del botón según el riesgo.** "Buttons → Button Placement": la acción
  destacada se reserva y se intercambia cuando el flujo quiere **desalentar** una
  acción destructiva. Aplicado: con un paquete de alto riesgo, "Install" pasa a
  botón perfilado (no relleno) manteniendo su posición a la derecha.
- **Mensajes de error accionables.** "Forms → Effective Error Messaging": no basta
  con decir que hay un error, hay que explicar qué falló y cómo corregirlo.
- **Iconos.** "Icons → Utilizing Icons Effectively": un solo estilo, marcos
  consistentes (16/24/32/40px), sin más de 3–4 colores, e iconos de aclaración
  (icono + texto) que refuercen el título en vez de competir con él; en el libro
  los iconos de navegación van al 60–70% de opacidad del texto. Aplicado a los
  iconos de sección (opacidad 0.7) y a los chevrons.
- **Divulgación progresiva.** "FAQs → Design Guidelines": los iconos son la señal
  de que un área se puede expandir, con interlineado amplio y líneas separadoras.
  Aplicado: chevrons reales en lugar de flechas tipográficas ("▼"), y espaciado
  entre filas.
- **Wizards.** "Wizards → Designing an Effective Wizard": indicar el progreso
  numerando los pasos o marcando la dirección del flujo, con etiquetas cortas.
  Aplicado: indicador Review · Install · Done en la cabecera del modal.
- **Contenedores (cards).** "Cards → Designing Cards": jerarquía visual con lo
  crítico arriba, contenido conciso, enmarcado consistente. Aplicado a las filas
  de hallazgos: mismo padding, mismo radio, mismo borde.
- **60-30-10.** "Colors → Crafting a Harmonious Color Palette, Step 5": 60%
  dominante neutro, 30% secundario, 10% acento. El acento se reserva para la
  acción principal y el estado activo, no para decorar cada bloque.
