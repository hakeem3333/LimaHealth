import { Prisma } from "@prisma/client";
import type { Request } from "express";

export type Organisation = Prisma.OrganisationGetPayload<{
  include: { users: true; subscriptions: true };
}>;

export type Subscription = Prisma.SubscriptionGetPayload<{
  include: { org: true };
}>;

export type Role = Prisma.RoleGetPayload<{
  include: { users: true };
}>;

export type User = Prisma.UserGetPayload<{
  include: {
    org: true;
    role: true;
    biometricLogs: true;
    moodLogs: true;
    alertsAsStudent: true;
    alertsAsCounselor: true;
    parentOf: true;
    studentOf: true;
    consent: true;
  };
}>;

export type BiometricLog = Prisma.BiometricLogGetPayload<{ include: { user: true } }>;
export type MoodLog      = Prisma.MoodLogGetPayload<{ include: { user: true } }>;
export type Alert        = Prisma.AlertGetPayload<{ include: { student: true; counselor: true } }>;

export type ParentStudentRelationship = Prisma.ParentStudentRelationshipGetPayload<{
  include: { parent: true; student: true };
}>;

export type Consent = Prisma.ConsentGetPayload<{ include: { user: true } }>;

// JWT payload set by auth.middleware.ts
export type JwtUserPayload = {
  id:          string;
  email?:      string;
  role:        string;
  orgId?:      string;
  orgStatus?:  string;
  orgType?:    string;
  permissions: string[];
};

export interface AuthRequest extends Request {
  user?: JwtUserPayload;
}
