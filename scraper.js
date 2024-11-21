const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeSpotifyPlaylists(artistId) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const url = `https://open.spotify.com/intl-es/artist/${artistId}/discovered-on`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Espera a que las tarjetas de playlists carguen
  await page.waitForSelector('div[role="button"]');

  // Recopila todos los botones de las playlists
  const playlistButtons = await page.$$eval('div[role="button"]', (buttons) =>
    buttons.map((button, index) => ({
      index,
      ariaLabel: button.getAttribute('aria-labelledby'),
    }))
  );

  const playlistDetails = [];

  for (const button of playlistButtons) {
    const selector = `div[role="button"][aria-labelledby="${button.ariaLabel}"]`;

    try {
      // Haz clic en el botón correspondiente
      await page.click(selector);

      // Espera a que se cargue la página de la playlist
      await page.waitForSelector('div.RP2rRchy4i8TIp1CTmb7', { timeout: 5000 });

      // Extrae los detalles de la playlist
      const details = await page.evaluate(() => {
        const container = document.querySelector('div.RP2rRchy4i8TIp1CTmb7');
        if (!container) return null;

        const title = container.querySelector('h1[data-encore-id="text"]')?.innerText.trim() || 'Sin título';
        const description = container.querySelector('div.xgmjVLxjqfcXK5BV_XyN')?.innerText.trim() || 'Sin descripción';
        const saves = container.querySelector('span.w1TBi3o5CTM7zW1EB3Bm')?.innerText.trim() || 'No disponible';
        const creator = container.querySelector('a[data-testid="creator-link"]')?.innerText.trim() || 'Desconocido';
        const creatorLink = container.querySelector('a[data-testid="creator-link"]')?.href || 'Sin enlace';
        const songsAndDuration = container.querySelector('div.GI8QLntnaSCh2ONX_y2c')?.innerText.trim() || 'Sin datos';

        // Extraer la URL de la imagen
        const image = document.querySelector('div[data-testid="playlist-image"] img')?.src || 'Sin imagen';

        return { title, description, saves, creator, creatorLink, songsAndDuration, image };
      });

      if (details) {
        playlistDetails.push(details);
      }

      // Regresa a la página principal
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector(selector); // Espera a que el botón esté visible otra vez
    } catch (error) {
      console.warn(`Error al procesar playlist con selector: ${selector}`, error);
    }
  }

  // Sort playlists by 'saves' in descending order (max to min)
  playlistDetails.sort((a, b) => {
    const savesA = parseInt(a.saves.replace(/\D/g, '')); // Remove non-numeric characters and convert to number
    const savesB = parseInt(b.saves.replace(/\D/g, ''));
    return savesB - savesA;
  });

  // Generar una página HTML para visualizar la información
  generateHTML(playlistDetails);

  console.log("Se ha generado un archivo 'playlists.html' con la información recopilada.");

  // Cierra el navegador
  await browser.close();
}

function generateHTML(data) {
  // Crea el contenido HTML
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Playlists del Artista</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background-color: #f8f8f8;
          color: #333;
          margin: 0;
          padding: 20px;
        }
        .playlist {
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #fff;
          margin-bottom: 20px;
          padding: 20px;
          display: flex;
          align-items: center;
        }
        .playlist img {
          width: 100px;
          height: 100px;
          border-radius: 8px;
          margin-right: 20px;
        }
        .playlist-info {
          flex: 1;
        }
        .playlist-info h2 {
          margin: 0 0 10px;
        }
        .playlist-info p {
          margin: 5px 0;
        }
        .playlist-info a {
          color: #0073e6;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <h1>Playlists en las que aparece el artista</h1>
      ${data
        .map(
          (playlist) => `
<div class="playlist">
  <img src="${playlist.image}" alt="${playlist.title}">
  <div class="playlist-info">
    <h2>${playlist.title}</h2>
    <p><strong>Descripción:</strong> ${playlist.description}</p>
    <p>
      <strong>Veces guardada:</strong> ${playlist.saves}
    </p>
    <p>
      <strong>Creador:</strong> 
      <a href="${playlist.creatorLink}" target="_blank">${playlist.creator}</a>
    </p>
        <p>
      
      <strong>Nombre para copiar:</strong> ${playlist.creator}
    </p>
    <p>
      <strong>Detalles:</strong> ${playlist.songsAndDuration}
    </p>
  </div>
</div>
      `
        )
        .join('')}
    </body>
    </html>
  `;

  // Escribir el HTML a un archivo
  fs.writeFileSync('playlists.html', htmlContent, 'utf-8');
}

// Llama la función con el ID de un artista
scrapeSpotifyPlaylists('23f1TZbdzyr3w45dyXx1BK');
