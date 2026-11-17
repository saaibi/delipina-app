import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { configureApp } from "./domain.js";
@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status =
      e.code === "23505"
        ? 409
        : e instanceof HttpException
          ? e.getStatus()
          : e.status || 400;
    res.status(status).json({
      error:
        e.code === "23505"
          ? "Registro duplicado"
          : status === 404
            ? "Ruta inexistente"
            : e.status
              ? e.message
              : "Solicitud inválida",
    });
  }
}
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === "test" ? false : ["error", "warn"],
  });
  configureApp(app.getHttpAdapter().getInstance());
  app.useGlobalFilters(new ApiExceptionFilter());
  return app;
}
