# Guía de Estilo - Klia Store

## Filosofía de Diseño

Este proyecto sigue los principios de **Clean UI** y **Modern Dark Mode Design**, inspirado en las tendencias actuales de GitHub Dark, VS Code, y aplicaciones modernas de escritorio.

## Principios Fundamentales

### 1. Superficie Unificada (Glassy Effect)
- Usar un solo color de fondo (`background.paper`) con bordes sutiles
- Evitar bloques de color sólidos y pesados
- Bordes con transparencia: `rgba(255, 255, 255, 0.1)`
- En hover, los bordes se iluminan con el color primario

### 2. Jerarquía Visual Clara
- **Acción Primaria**: Botones grandes, con color de relleno, alto contraste
- **Acción Secundaria**: IconButtons sutiles, solo se iluminan en hover
- **Información Técnica**: Tipografía monospace, opacidad reducida (0.5-0.7)

### 3. Micro-interacciones
- Efecto de levitación (`translateY(-5px)`) en hover
- Transiciones suaves: `transition: 'all 0.3s ease-in-out'`
- Sombras dinámicas que aumentan en hover
- Bordes que cambian de color para indicar foco

### 4. Tipografía Contextual
- **Nombres y Títulos**: Fuente regular, bold, tamaño destacado
- **IDs Técnicos**: `fontFamily: 'monospace'` para indicar datos de sistema
- **Descripciones**: Color secundario, tamaño body2
- **Versiones**: Chips con fondo semi-transparente

## Componentes Específicos

### Card de Aplicación (InstalledAppCard)

#### Estructura
```
┌─────────────────────────────┐
│  [History] [Delete]         │ ← Acciones secundarias (esquina superior)
│                             │
│       [App Icon]            │ ← Icono con drop-shadow
│       App Name              │
│     [Developer Chip]        │
│                             │
│   Description text...       │
│                             │
│ ─────────────────────────── │ ← Divisor sutil
│     com.app.id              │ ← ID técnico (monospace, discreto)
│  [Update to vX.X.X]         │ ← Acción primaria (botón full-width)
└─────────────────────────────┘
```

#### Estilo de Bordes
- `borderRadius: 4` (16-32px según configuración MUI)
- `border: '1px solid rgba(255, 255, 255, 0.1)'`
- Hover: `borderColor: 'primary.main'`

#### Elevación y Sombras
- `elevation={0}` (sin sombra por defecto)
- Hover: `boxShadow: '0 8px 24px -4px rgba(0,0,0,0.6)'`
- Botones primarios: `boxShadow: '0 4px 12px rgba(74, 134, 207, 0.3)'`

#### Iconos
- Iconos de app: `filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))'`
- Tamaño consistente: 72x72px para apps instaladas

### Chips (Etiquetas)

#### Developer Chip
```tsx
<Chip
  label={developer}
  size="small"
  variant="outlined"
  sx={{
    color: 'text.secondary',
    borderColor: 'rgba(255,255,255,0.1)',
  }}
/>
```

#### Version Chip
```tsx
<Chip
  label={`v${version}`}
  size="small"
  sx={{
    backgroundColor: 'rgba(88, 166, 255, 0.1)',
    color: 'info.main',
    fontWeight: 600,
  }}
/>
```

### Botones

#### Botón Primario (Actualizar)
- `variant="contained"`
- `fullWidth` para máxima área de clic (Ley de Fitts)
- Incluye icono (`startIcon={<Update />}`)
- Texto descriptivo: "Update v1.2.3"
- Sombra con glow del color primario

#### Botón Secundario/Informativo
- `variant="text"` o `IconButton`
- Sin color de fondo por defecto
- Color y fondo solo en hover
- Borde sutil opcional: `border: '1px solid rgba(255,255,255,0.1)'`

#### Botón Destructivo (Eliminar)
- IconButton sin color por defecto
- Color `error.main` solo en hover
- Fondo semi-transparente en hover: `rgba(255, 107, 107, 0.1)`
- Tooltip descriptivo obligatorio

## Espaciado y Layout

### Márgenes Internos
- CardContent padding: `p: 3` (24px)
- Gap entre elementos: `gap: 1` (8px) o `gap: 1.5` (12px)
- Separación de secciones: `mb: 1` o `mb: 2`

### Divisores
- Color: `rgba(255,255,255,0.05)` - muy sutil
- Border: `borderTop: '1px solid'`
- Padding: `pt: 1` (8px)

### Altura de Cards
- Altura fija para consistencia: `340px`
- Usar `flexGrow: 1` en descripción para empujar footer al fondo
- `mt: 'auto'` en el footer para anclarlo abajo

## Accesibilidad

### Tooltips
- Siempre incluir tooltips en IconButtons
- Usar traducciones (`t()`) para textos
- Describir la acción, no el icono

### Estados Disabled
- Reducir opacidad o cambiar a grises
- Mantener legibilidad del texto
- Indicar visualmente que la acción no está disponible

### Áreas de Clic
- Botones primarios: Full width cuando sea posible
- IconButtons: `size="small"` pero con padding adecuado
- Espaciado mínimo entre botones: `spacing={1}`

## Paleta de Colores

### Principales
- **Primary**: `#4A86CF` (Azul) - Acciones principales
- **Info**: `#58A6FF` (Azul claro) - Información, versiones
- **Error**: `#FF6B6B` (Rojo) - Acciones destructivas
- **Text Secondary**: Gris claro - Información secundaria

### Opacidades
- Bordes sutiles: `0.1`
- Información técnica: `0.5-0.7`
- Fondos hover: `0.1`

## Anti-patrones a Evitar

❌ **No usar**:
- Colores de error permanentes (solo en hover)
- Múltiples elevaciones (`elevation`) en modo dark
- Bloques de color sólidos para separar secciones
- Bordes gruesos o muy contrastados
- Fuentes sans-serif para IDs técnicos

✅ **Usar en su lugar**:
- Colores neutros que se vuelven semánticos en hover
- Bordes sutiles con transparencia
- Divisores con opacidad muy baja
- Tipografía monospace para datos técnicos
- Jerarquía visual mediante tamaño, peso y espaciado

## Referencias

- **Material Design 3**: Fundamentos de componentes
- **GitHub Dark Theme**: Inspiración para bordes y superficies
- **Ley de Fitts**: Botones primarios grandes y accesibles
- **Clean UI**: Minimalismo, jerarquía clara, micro-interacciones sutiles
