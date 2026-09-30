# Radar y Brave cada seis horas

## Problema y comportamiento corregido

Los registros del despliegue `6af4cc2b` mostraban ocho consultas de Brave cada treinta minutos. La selección variaba por día, por lo que se repetía durante el resto del día. La búsqueda auxiliar de URLs disparada por extracción de IA no compartía contador, timeout ni límites con el descubrimiento. Una búsqueda correcta sin URLs nuevas activaba innecesariamente Groq. El cursor de revisión y el historial del worker se perdían al reiniciar Render.

La implementación nueva reserva ventanas de seis horas, rota cuatro consultas, cuenta todos los intentos de Brave antes del envío, guarda presupuesto y cursor en Supabase y comparte la ejecución entre el horario y el endpoint administrativo. Las respuestas del proveedor se resumen en categorías; no se guardan cuerpos de error ni claves. Los 401/403, 402, 429, errores de red y fallos de guardado quedan visibles. El límite máximo de la aplicación es 600 solicitudes por mes UTC.

## Ejecución gratuita

El horario de GitHub Actions es `17 */6 * * *`. Solo consulta el servicio existente; no obtiene claves ni crea un segundo escritor de la base. Despierta Render si es necesario y verifica el resultado real de Brave. El servidor también programa los mismos horarios mientras está activo. El límite mensual y las reservas sobreviven a un reinicio. La ejecución se detiene si falta la clave, el worker está desactivado o el proveedor devuelve un error; alcanzar el presupuesto es una pausa esperada.

Los planes de Render y Supabase se mantienen Free. El contador nuevo no conoce el consumo anterior de la cuenta Brave ni el consumo de otros proyectos; debe contrastarse con los créditos disponibles en su panel. GitHub puede retrasar u omitir un horario, y en repositorios públicos puede desactivarlo tras 60 días sin actividad. Estos límites se explican en README.

## Calidad y observabilidad

Las búsquedas siguen generando pistas no verificadas. Una URL encontrada no se convierte en oferta oficial. La interfaz muestra la última búsqueda y la próxima ventana, ofrece enlaces a las fuentes y diferencia restricciones de terceros de errores de la aplicación. Los 404/410 dejan de mostrarse como comprobaciones exitosas. La lista de fuentes empieza con 80 filas y permite cargar más.

El buscador del catálogo reconoce tildes y categorías en español, combina palabras repartidas entre marca y descripción y prioriza coincidencias exactas de marca. `AI` e `IA` no coinciden con fragmentos de palabras no relacionadas como `paid`. Los filtros y la exclusión de ofertas no revisadas se conservan.

## Verificación exigida antes de publicar

- Simular consultas y rotación, ejecución simultánea y recarga del estado persistido.
- Probar contador compartido, cambio de mes y límite máximo.
- Probar 429 y que no se envíe ninguna consulta sin poder guardar la reserva.
- Probar el cursor tras recarga, historial y exclusión de ejecuciones paralelas.
- Probar que resultados vacíos de Brave no activen Groq.
- Ejecutar pruebas de interfaz y toda la suite HTTP/IA/persistencia.
- Validar YAML y Python del workflow; comprobar CI y el servicio publicado.

La activación real del horario se confirma con una ejecución correcta de GitHub Actions y un resultado nuevo en `/api/worker-status`; publicar el archivo por sí solo no prueba esa activación.

Validación local completada: **36 pruebas correctas, 0 fallos**, incluyendo búsqueda, límites de Brave, concurrencia, HTTP, IA, correo simulado y persistencia. YAML, Python integrado, sintaxis JavaScript, versiones de paquete y revisión de espacios comprobados. El envío real de correo y las condiciones de facturación de otros usos de Brave no quedan verificados por estas pruebas.
