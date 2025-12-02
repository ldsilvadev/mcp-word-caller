import { ConfidentialClientApplication, LogLevel } from "@azure/msal-node";
import "dotenv/config"; // Certifique-se de ter 'dotenv' instalado ou carregar as envs antes

// --- CONFIGURAÇÃO ---
// É crucial que estas variáveis estejam no seu .env
const CLIENT_ID = process.env.AZURE_CLIENT_ID || "";
const TENANT_ID = process.env.AZURE_TENANT_ID || ""; 
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || "";

if (!CLIENT_ID || !TENANT_ID || !CLIENT_SECRET) {
  throw new Error("❌ [Auth] Faltam variáveis de ambiente: AZURE_CLIENT_ID, AZURE_TENANT_ID ou AZURE_CLIENT_SECRET.");
}

const MSAL_CONFIG = {
  auth: {
    clientId: CLIENT_ID,
    // Para Client Credentials, NÃO use 'common'. Use o ID específico do Tenant.
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
    clientSecret: CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel: LogLevel, message: string, containsPii: boolean) {
        // Reduzi o log para não poluir, mostre apenas erros ou avisos
        if (loglevel === LogLevel.Error || loglevel === LogLevel.Warning) {
             console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Info,
    },
  },
};

export class AuthService {
  private cca: ConfidentialClientApplication;

  constructor() {
    // Mudança chave: ConfidentialClientApplication
    this.cca = new ConfidentialClientApplication(MSAL_CONFIG);
  }

  /**
   * Obtém o token "App Only" (Modo Deus/Sistema).
   * Não precisa de inicialização, nem de login interativo.
   */
  async getAccessToken(): Promise<string> {
    try {
      // O escopo .default diz: "Me dê todas as permissões de aplicativo que o admin liberou no portal"
      const result = await this.cca.acquireTokenByClientCredential({
        scopes: ["https://graph.microsoft.com/.default"],
      });

      if (!result || !result.accessToken) {
        throw new Error("Resposta de token vazia da Microsoft.");
      }

      return result.accessToken;
      
    } catch (error) {
      console.error("❌ [Auth] Falha ao obter token de aplicativo:", error);
      throw error;
    }
  }
}

export const authService = new AuthService();