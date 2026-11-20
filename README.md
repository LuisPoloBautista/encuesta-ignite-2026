# Encuesta satisfacción 2026 · Ignite Online

Formulario responsivo por pasos con rutas condicionales, guardado de borrador, almacenamiento en Supabase PostgreSQL y exportación a Excel.

## Ejecutar localmente

1. Instala Node.js 20 o superior y crea un proyecto en Supabase.
2. Copia `.env.example` a `.env` y configura `DATABASE_URL`, `ADMIN_USER` y `ADMIN_PASSWORD`. Para habilitar el perfil limitado de 4PROT y CloudLabs, configura también `PRODUCT_ADMIN_USER` y `PRODUCT_ADMIN_PASSWORD`.
3. Ejecuta:

```bash
npm install
npm start
```

Abre `http://localhost:10000`. La exportación administrativa está en `http://localhost:10000/admin`.

> El servidor lee variables de entorno del sistema. Si usas un archivo `.env` local, cárgalo con tu terminal o configura las variables antes de ejecutar `npm start`.

## Configurar Supabase

1. Crea o abre tu proyecto de Supabase.
2. Pulsa **Connect** en la parte superior del proyecto.
3. Elige **Session pooler** y copia la URI que usa el puerto `5432`.
4. Sustituye `[YOUR-PASSWORD]` por la contraseña de la base de datos. Si contiene caracteres reservados, codifícalos para URL.
5. Guarda esa URI únicamente como `DATABASE_URL` en Render; nunca la escribas en archivos públicos ni en GitHub.

El servidor crea automáticamente la tabla `survey_responses` durante el primer arranque.

## Desplegar en Render con Supabase

La configuración base está en `render.yaml`.

1. Sube este proyecto a un repositorio de GitHub o GitLab.
2. Dentro del mismo proyecto de Render, crea o configura un **Web Service** con este repositorio.
3. Usa `npm install` como Build Command y `npm start` como Start Command.
4. Agrega estas variables de entorno:
   - `DATABASE_URL`: URI de **Session pooler** copiada de Supabase.
   - `ADMIN_USER`: `admin`.
   - `ADMIN_PASSWORD`: una contraseña larga y única.
   - `PRODUCT_ADMIN_USER`: usuario del perfil limitado a clientes con 4PROT o CloudLabs.
   - `PRODUCT_ADMIN_PASSWORD`: una contraseña distinta, larga y única para ese perfil.
   - `TRUST_PROXY`: `1`.
5. Despliega y comprueba `/api/health`: debe responder con `"storage":"postgresql"`.

También puedes crear el Web Service usando el Blueprint `render.yaml`; Render solicitará `DATABASE_URL`, `ADMIN_PASSWORD` y `PRODUCT_ADMIN_PASSWORD` porque no están guardadas en el repositorio.

> Si el despliegue actual es un **Static Site**, Render no permite convertir ese mismo servicio a Web Service. Puedes mantener el mismo proyecto de Render, pero debes agregar un Web Service y después trasladar allí tu dominio. No necesitas crear otro proyecto de Render.

No guardes respuestas en un archivo local dentro del Web Service: el sistema de archivos normal de Render es efímero. Supabase conserva los envíos y el Excel se genera bajo demanda.

## Exportar respuestas

1. Abre `/admin` en el dominio desplegado.
2. Ingresa el usuario `admin` y la contraseña configurada en `ADMIN_PASSWORD`.
3. Pulsa **Descargar Excel**.

El archivo contiene una fila por respuesta, campos de identificación al inicio y el resto de respuestas en columnas independientes.

La cuenta configurada con `ADMIN_USER` conserva el acceso completo. La cuenta configurada con `PRODUCT_ADMIN_USER` puede consultar y descargar la encuesta completa únicamente de clientes que seleccionaron 4PROT, CloudLabs o ambos.

## Archivos principales

- `public/index.html`: estructura pública.
- `public/styles.css`: diseño responsivo e identidad visual.
- `public/admin.html` y `public/admin.js`: acceso administrativo y descarga del Excel.
- `public/app.js`: preguntas, navegación y lógica condicional.
- `server.js`: API, PostgreSQL y exportación `.xlsx`.
- `Encuesta_Ignite_2026.html`: documento original de requisitos conservado como referencia.

## Privacidad y operación

La encuesta recopila datos personales. Antes de publicarla, define aviso de privacidad, periodo de conservación y quién puede acceder a la descarga. Cambia `ADMIN_PASSWORD` inmediatamente si se comparte accidentalmente y no uses `root` ni otra contraseña fácil de adivinar.
