// Gateway

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const {
  Filter,
  Options,
  createProxyMiddleware: createHttpProxyMiddleware,
  RequestHandler,
} = require("http-proxy-middleware");
const rateLimit = require("express-rate-limit");
require("dotenv").config({ path: "../.env" });

const app = express();

class Proxy {
  /**
   *
   * @param {string} name
   * @param {Filter | Options} context
   * @param {number} port
   * @param {string} protocol
   */
  constructor(name, context, port, protocol = "http") {
    this.name = name;
    this.context = context;
    this.port = port;
    this.protocol = protocol;
    proxies = [...proxies, this];
  }

  /**
   *
   * @returns RequestHandler
   */
  create() {
    return createHttpProxyMiddleware(this.context, {
      target: {
        host: "localhost",
        port: this.port,
        protocol: this.protocol,
      },
      changeOrigin: true,
    });
  }

  /**
   * @returns string
   */
  get path() {
    return `${this.protocol}://localhost:${this.port}/api/${this.name}`;
  }

  /**
   * @returns Promise<void>
   */
  async test() {
    try {
      await axios.get(this.path + "/test");
      console.log(`[TEST SUCCESSFUL] ${this.name} api`);
    } catch (error) {
      console.log(`[TEST FAILED] ${this.name} api: ${error.message}`);
      process.exit(1);
    }
  }
}

let proxies = [];

// creating proxies
const userApi = new Proxy("users", "/api/users/**", process.env.USER_PORT);
const todoApi = new Proxy("todos", "/api/todos/**", process.env.TODO_PORT);

// testing proxies
const proxiesToTest = [userApi];
let testedProxies = 0;
const proxiesRequestHandlers = new Map();
for (let i = 0; i < proxiesToTest.length; i++) {
  (async () => {
    await proxiesToTest[i].test();
    testedProxies++;
    if (proxiesToTest.length === testedProxies) {
      /**
       * example:
       * "users" -> userProxy (userApi.create)
       * "todos" -> todoProxy (todoApi.create)
       */
      proxiesToTest.forEach((proxy) => {
        proxiesRequestHandlers.set(proxy.name, proxy.create());
      });
      // all the code goes here. Reason: Do not build proxy before it is tested
      // establishing rate limit
      const limiter = rateLimit({
        windowMs: 30 * 1000,
        max: 15,
        message: `Too many requests. Try again later`,
      });

      // middlewares

      // using app.use(express.json() or express.urlencoded()) BREAKS the app: https://github.com/chimurai/http-proxy-middleware/issues/417
      app.use(cors());
      app.use(limiter);

      // dynamically generated routes
      for (let i = 0; i < proxies.length; i++) {
        app.use(
          `/api/${proxies[i].name}/**`,
          customExpressRequestHandler(proxies[i].name)
        );
      }

      const GATEWAY_PORT = process.env.GATEWAY_PORT || 5000;
      app.listen(GATEWAY_PORT, () => {
        console.log(
          `[GATEWAY LISTENING] Gateway is listening on port ${GATEWAY_PORT}`
        );
      });
    }
  })();
}

function proxyErrorHandler(_req, res) {
  res.send(
    "The accessed resource is not available right now. Please try again later"
  );
}

/**
 *
 * @param {string} name
 */
function customExpressRequestHandler(name) {
  // when proxy is not set in the proxiesToTest array, return the proxyErrorHandler error message (refer to proxyErrorHandler function)
  return proxiesRequestHandlers.get(name) || proxyErrorHandler;
}
