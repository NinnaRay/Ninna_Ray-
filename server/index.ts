import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
const GIRL_IMAGES = [
  "/images/IMG_7766.jpeg",
  "/images/IMG_7767.jpeg",
  "/images/IMG_7825.jpeg"
];
const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    app.post('/chat', (req, res) => {
      const message = req.body.message;
      const status = 200;

      // nastavíme, že odpověď bude HTML, aby šel obrázek vložit přímo
      res.status(status);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      // náhodný delay 10 s – 2 min
      const delay = 10000 + Math.random() * 110000;

      // rychlost "tipování"
      const typingSpeed = 40; // ms mezi znaky
      const slowTyping = Math.random() < 0.7; // 70 % šance, že bude tipovat pomalu

      setTimeout(() => {
        // náhodně rozhodneme, jestli pošleme obrázek
        const wantsPic =
          /foto|pic|ukáž|pošli|sexy|hot|vidět tě/i.test(message) ||
          Math.random() < 0.35;

        // vytvoříme finální zprávu
        let fullMessage = message;

        if (wantsPic) {
          const img = GIRL_IMAGES[Math.floor(Math.random() * GIRL_IMAGES.length)];
          fullMessage += `<br/><img src="${img}" style="max-width:100%; border-radius:14px; margin-top:8px;" />`;
        }

        if (!slowTyping) {
          // okamžitá odpověď (není vždy pomalé tipování)
          res.end(fullMessage);
          return;
        }

        // pomalé tipování znak po znaku s překlepy
        let i = 0;
        const typeChar = () => {
          if (i < fullMessage.length) {
            let charToSend = fullMessage[i];

            // malá šance na překlep
            if (Math.random() < 0.03 && /[a-zA-Z]/.test(charToSend)) {
              const wrongChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));
              res.write(wrongChar);

              // opravíme překlep hned po krátké pauze
              setTimeout(() => {
                res.write('\b' + charToSend);
              }, typingSpeed);
            } else {
              res.write(charToSend);
            }

            i++;
            setTimeout(typeChar, typingSpeed);
          } else {
            res.end(); // dokončení odeslání
          }
        };

        typeChar();
      }, delay);
    });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
// ===== AUTO FOLLOW-UP ZPRÁVY =====

const FOLLOW_UP_MESSAGES = [
  "hej… pořád jsi tu? 😏",
  "nějak na tebe myslím… 🙈",
  "zmizel jsi mi nebo se jen schováváš? 😘",
  "hmm… teď bych si s tebou klidně psala 😈"
];

// každých 5 minut zkusí někomu napsat
setInterval(async () => {
  try {
    // vezmeme uživatele, co psali před víc než 10 minutami
    const result = await db.execute(`
      SELECT u.id as user_id, c.id as conversation_id
      FROM users u
      JOIN conversations c ON c.user_id = u.id
      WHERE c.id IN (
        SELECT conversation_id FROM messages
        GROUP BY conversation_id
        HAVING MAX(created_at) < NOW() - INTERVAL '10 minutes'
      )
      LIMIT 1
    `);

    if (!result.rows.length) return;

    const row = result.rows[0];
    const text = FOLLOW_UP_MESSAGES[Math.floor(Math.random() * FOLLOW_UP_MESSAGES.length)];

    await db.execute(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (${row.conversation_id}, 'assistant', '${text}')
    `);

    console.log("Auto message sent 😈");

  } catch (err) {
    console.error("Auto follow-up error:", err);
  }
}, 5 * 60 * 1000); // každých 5 minut