import { NativePushController } from "./native-push.controller.js";
import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
@Module({ controllers: [NotificationsController, NativePushController] })
export class NotificationsModule {}
