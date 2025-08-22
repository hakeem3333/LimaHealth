import { Prisma } from "@prisma/client";

/**
 * Type definition for the School model, including its users and subscriptions.
 */
export type School = Prisma.SchoolGetPayload<{
  include: {
    users: true;
    subscriptions: true;
  };
}>;

/**
 * Type definition for the Subscription model, including its related school.
 */
export type Subscription = Prisma.SubscriptionGetPayload<{
  include: {
    school: true;
  };
}>;

/**
 * Type definition for the Role model, including its related users.
 */
export type Role = Prisma.RoleGetPayload<{
  include: {
    users: true;
  };
}>;

/**
 * Type definition for the User model, including all its related data.
 */
export type User = Prisma.UserGetPayload<{
  include: {
    school: true;
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

/**
 * Type definition for the BiometricLog model, including its related user.
 */
export type BiometricLog = Prisma.BiometricLogGetPayload<{
  include: {
    user: true;
  };
}>;

/**
 * Type definition for the MoodLog model, including its related user.
 */
export type MoodLog = Prisma.MoodLogGetPayload<{
  include: {
    user: true;
  };
}>;

/**
 * Type definition for the Alert model, including the student and counselor.
 */
export type Alert = Prisma.AlertGetPayload<{
  include: {
    student: true;
    counselor: true;
  };
}>;

/**
 * Type definition for the ParentStudentRelationship model, including the parent and student.
 */
export type ParentStudentRelationship =
  Prisma.ParentStudentRelationshipGetPayload<{
    include: {
      parent: true;
      student: true;
    };
  }>;

/**
 * Type definition for the Consent model, including its related user.
 */
export type Consent = Prisma.ConsentGetPayload<{
  include: {
    user: true;
  };
}>;
