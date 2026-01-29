#!/bin/bash

# Script para ejecutar tests de WebDriver con Tauri

BINARY_PATH="src-tauri/target/release/klia-store"

# Solo compila si el binario no existe
if [ ! -f "$BINARY_PATH" ]; then
    echo "🔧 Compilando la aplicación Tauri (primera vez)..."
    cd src-tauri && cargo build --release && cd ..

    if [ $? -ne 0 ]; then
        echo "❌ Error al compilar la aplicación"
        exit 1
    fi
else
    echo "✓ Usando binario existente (salta compilación si no hay cambios)"
    echo "  Para recompilar: rm $BINARY_PATH"
fi

echo "🚀 Iniciando tauri-driver..."
tauri-driver --native-driver /usr/bin/WebKitWebDriver --port 4444 &
DRIVER_PID=$!

# Espera a que tauri-driver esté listo
sleep 3

echo "🧪 Ejecutando tests..."
npx wdio run wdio.conf.ts

TEST_EXIT_CODE=$?

echo "🛑 Deteniendo tauri-driver..."
kill $DRIVER_PID

exit $TEST_EXIT_CODE
