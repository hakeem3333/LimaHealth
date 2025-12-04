export const sanitizeUser = (user: any) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  firstName: user.firstName,
  lastName: user.lastName,
});
