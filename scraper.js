const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeSpotifyPlaylists(artistId) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // URL base del artista principal
  const baseUrl = `https://open.spotify.com/intl-es/artist/${artistId}`;
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  // Esperar y obtener los IDs de los primeros 5 artistas relacionados
  await page.waitForSelector('div[data-testid="grid-container"]');
  const relatedArtists = await page.$$eval(
    'div[data-testid="grid-container"] [id^="card-subtitle-spotify:artist:"]',
    (elements) =>
      elements
        .map((el) => el.id.match(/card-subtitle-spotify:artist:([^-\s]+)/)?.[1]) // Extraer solo el ID
        .filter(Boolean) // Filtrar valores no definidos
        .slice(0, 5) // Obtener solo los primeros 5
  );

  const allPlaylists = [];

  // Función para extraer playlists de la sección "Discovered On"
  async function scrapeDiscoveredOn(artistId) {
    const discoveredUrl = `https://open.spotify.com/intl-es/artist/${artistId}/discovered-on`;
    await page.goto(discoveredUrl, { waitUntil: 'domcontentloaded' });

    // Esperar a que carguen las tarjetas de las playlists
    await page.waitForSelector('div[role="button"]', { timeout: 5000 });

    // Obtener información básica de cada playlist
    const playlists = await page.$$eval('div[role="button"]', (elements) =>
      elements.map((element) => {
        const ariaLabel = element.getAttribute('aria-labelledby');
        return {
          ariaLabel,
          selector: `div[role="button"][aria-labelledby="${ariaLabel}"]`,
        };
      })
    );

    const playlistDetails = [];

    for (const playlist of playlists) {
      try {
        const playlistElement = await page.$(playlist.selector);
        if (playlistElement) {
          await page.click(playlist.selector);

          await page.waitForSelector('div.RP2rRchy4i8TIp1CTmb7', { timeout: 5000 });

          const details = await page.evaluate(() => {
            const container = document.querySelector('div.RP2rRchy4i8TIp1CTmb7');
            if (!container) return null;

            const title = container.querySelector('h1[data-encore-id="text"]')?.innerText.trim() || 'Sin título';
            const description = container.querySelector('div.xgmjVLxjqfcXK5BV_XyN')?.innerText.trim() || 'Sin descripción';
            const saves = container.querySelector('span.w1TBi3o5CTM7zW1EB3Bm')?.innerText.trim() || 'No disponible';
            const creator = container.querySelector('a[data-testid="creator-link"]')?.innerText.trim() || 'Desconocido';
            const creatorLink = container.querySelector('a[data-testid="creator-link"]')?.href || 'Sin enlace';
            const songsAndDuration = container.querySelector('div.GI8QLntnaSCh2ONX_y2c')?.innerText.trim() || 'Sin datos';
            const image = document.querySelector('div[data-testid="playlist-image"] img')?.src || 'Sin imagen';

            return { title, description, saves, creator, creatorLink, songsAndDuration, image };
          });

          if (details) {
            playlistDetails.push(details);
          }
        }

        await page.goBack({ waitUntil: 'domcontentloaded' });
      } catch (error) {
        console.warn(`Error al procesar playlist: ${playlist.ariaLabel}`, error);
      }
    }

    return playlistDetails;
  }

  console.log(`Recopilando playlists del artista principal: ${baseUrl}`);
  const mainPlaylists = await scrapeDiscoveredOn(artistId);
  allPlaylists.push(...mainPlaylists);

  for (const relatedArtistId of relatedArtists) {
    const relatedArtistUrl = `https://open.spotify.com/intl-es/artist/${relatedArtistId}`;
    console.log(`Recopilando playlists del artista relacionado: ${relatedArtistUrl}`);

    try {
      const relatedPlaylists = await scrapeDiscoveredOn(relatedArtistId);
      allPlaylists.push(...relatedPlaylists);
    } catch (error) {
      console.error(`Error al procesar el artista relacionado ${relatedArtistId}:`, error);
    }
  }

  const uniquePlaylists = Array.from(
    new Map(allPlaylists.map((item) => [item.title, item])).values()
  );

  generateHTML(uniquePlaylists);
  console.log("Se ha generado un archivo 'playlists.html' con la información recopilada.");
  await browser.close();
}
// Función para generar un archivo HTML
function generateHTML(data) {
  // Normalizar y convertir "saves" en números
  const normalizeSaves = (saves) => {
    const numericValue = parseInt(saves.replace(/\D/g, ''), 10);
    return isNaN(numericValue) ? 0 : numericValue; // Si no es un número, devolver 0
  };

  // Ordenar los datos por la cantidad de "saves" en orden descendente
  const sortedData = data.sort((a, b) => normalizeSaves(b.saves) - normalizeSaves(a.saves));

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Playlists del Artista y Relacionados</title>
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
      <h1>Playlists en las que aparecen el artista y relacionados</h1>
      ${sortedData
        .map(
          (playlist) => `
<div class="playlist">
  <img src="${playlist.image}" alt="${playlist.title}">
  <div class="playlist-info">
    <h2>${playlist.title}</h2>
    <p><strong>Descripción:</strong> ${playlist.description}</p>
    <p><strong>Veces guardada:</strong> ${playlist.saves}</p>
    <p>
      <strong>Creador:</strong> 
      <a href="${playlist.creatorLink}" target="_blank">${playlist.creator}</a>
    </p>
     <p><strong>Nombre para copiar:</strong> ${playlist.creator}</p>
    <p><strong>Detalles:</strong> ${playlist.songsAndDuration}</p>
  </div>
</div>
        `
        )
        .join('')}
    </body>
    </html>
  `;

  fs.writeFileSync('playlists.html', htmlContent, 'utf-8');
}


// Llamar la función con el ID del artista principal
scrapeSpotifyPlaylists('3RavPo6KxPBl0pi612Mg8U');
