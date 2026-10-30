# Consolidación

Implementación basada en main `6e4aad79101c6aadb48b0051c6e45e8726b36be2`. Publicación autorizada por el usuario el 30 de octubre de 2026.

- Nueva pestaña global: pregunta primera salida y apoyo, sin filtrar grupos ni revelar temática.
- Cada vuelta toma las calles activas marcadas como aprendidas y las mezcla una vez. No se fija artificialmente el número 724.
- Guarda orden, respondidas y retiradas por perfil en `quiz_calles_vlc_v2_CONSOLIDATION_<usuario>`.
- Cada respuesta consume la calle. Una recuperación o aprendizaje nuevo espera a la siguiente vuelta.
- Si una calle pendiente deja de estar aprendida, se retira del resto de esa vuelta.
- Al continuar una vuelta terminada, crea otra con las aprendidas disponibles en ese momento.
- Objetivo diario editable de 50 a 100, sin límite obligatorio; contador diario independiente del cambio de vuelta.
- Reutiliza `checkAnswer`: fallo incrementa fallos, reinicia racha, desmarca aprendida/manual y activa pendingFail. Repaso y No aprendidas conservan sus reglas.
- En esta pestaña se bloquean Atrás y Siguiente sin respuesta para impedir repetir o saltarse posiciones.
- La nueva clave participa en copia completa y sincronización existentes. Los conflictos de la misma vuelta unen las calles consumidas; entre vueltas prevalece la más avanzada.

## Verificación

`node test-consolidation.cjs`: pruebas con 724 calles simuladas; unicidad, recarga, penalización idéntica a main, recuperación con las funciones reales, nueva vuelta, exclusión de nuevas aprendidas hasta la siguiente vuelta, retirada de pendientes, aislamiento de perfiles y fusión de cola. Comparación literal de funciones originales de aprendizaje y cola existente.

Prueba de navegador en origen local separado: 724 calles de catálogo; marcar una de prueba, entrar en Consolidación, responder incorrectamente, observar pérdida de aprendida y contador 1/1; recargar y comprobar persistencia de la vuelta y objetivo 100. No se usaron ni modificaron los datos de producción.

Pendientes antes de publicación: revisión móvil y prueba autenticada de sincronización entre dispositivos. El contador diario, como otros contadores del sistema, usa máximos al fusionar conflictos; dos dispositivos trabajando simultáneamente sin conexión pueden subcontar el total diario. La cola fusiona las calles consumidas, pero no puede impedir que dos dispositivos desconectados presenten simultáneamente la misma pregunta.
