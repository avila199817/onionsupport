# App Chrome — aceptación móvil

Validación manual recomendada en viewport `<= 900px`:

1. El panel privado carga con Sidebar cerrado y sin rail lateral.
2. El botón hamburguesa aparece dentro del Topbar, alineado con su altura y safe-area.
3. Topbar y `main-content` conservan el ancho completo; abrir/cerrar navegación no desplaza la vista.
4. Al pulsar hamburguesa, Sidebar entra desde la izquierda con todo su contenido, navegación y cuenta.
5. El resto del viewport queda cubierto por glass/blur y no permite interacción ni scroll de fondo.
6. Pulsar el glass cierra Sidebar sin activar el control que hay detrás.
7. `Escape` cierra Sidebar y devuelve foco al botón del Topbar.
8. `Tab` no abandona el Sidebar mientras está abierto.
9. Pulsar un enlace del Sidebar navega y cierra el drawer.
10. Atrás/adelante del navegador cierra el drawer si estaba abierto.
11. Al crecer por encima de 900px vuelve el comportamiento desktop y se restaura el estado previo de Sidebar.
12. Dark, light, reduced motion, reduced transparency y forced colors siguen teniendo salida definida.

No se considera válida una implementación que dependa de una segunda hamburguesa dentro del Sidebar, reserve un rail móvil o use la sombra del drawer como superficie de outside-click.
