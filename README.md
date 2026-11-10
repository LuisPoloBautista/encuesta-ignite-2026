# Encuesta satisfacción 2026 · Ignite Online

Formulario responsivo por pasos con rutas condicionales, guardado de borrador, almacenamiento en PostgreSQL y exportación a Excel.

## Ejecutar localmente

1. Instala Node.js 20 o superior y PostgreSQL.
2. Copia `.env.example` a `.env` y configura `DATABASE_URL` y `ADMIN_TOKEN`.
3. Ejecuta:

```bash
npm install
npm start
```

Abre `http://localhost:10000`. La exportación administrativa está en `http://localhost:10000/admin`.

> El servidor lee variables de entorno del sistema. Si usas un archivo `.env` local, cárgalo con tu terminal o configura las variables antes de ejecutar `npm start`.

## Desplegar en Render

La configuración base está en `render.yaml`.

1. Sube este proyecto a un repositorio de GitHub o GitLab.
2. En Render, crea una base de datos PostgreSQL.
3. Crea el Web Service usando el repositorio o el Blueprint `render.yaml`.
4. Configura `DATABASE_URL` con la **Internal Database URL** de PostgreSQL.
5. Render generará `ADMIN_TOKEN`; cópialo desde las variables de entorno y guárdalo en un gestor de contraseñas.
6. Comprueba `/api/health`: debe responder con `"storage":"postgresql"`.

No guardes respuestas en un archivo local dentro del Web Service: el sistema de archivos normal de Render es efímero. PostgreSQL conserva los envíos y el Excel se genera bajo demanda.

## Exportar respuestas

1. Abre `/admin` en el dominio desplegado.
2. Ingresa el valor de `ADMIN_TOKEN`.
3. Pulsa **Descargar Excel**.

El archivo contiene una fila por respuesta, campos de identificación al inicio y el resto de respuestas en columnas independientes.

## Archivos principales

- `public/index.html`: estructura pública.
- `public/styles.css`: diseño responsivo e identidad visual.
- `public/app.js`: preguntas, navegación y lógica condicional.
- `server.js`: API, PostgreSQL y exportación `.xlsx`.
- `Encuesta_Ignite_2026.html`: documento original de requisitos conservado como referencia.

## Privacidad y operación

La encuesta recopila datos personales. Antes de publicarla, define aviso de privacidad, periodo de conservación y quién puede acceder al token de exportación. Rota `ADMIN_TOKEN` si se comparte accidentalmente.
