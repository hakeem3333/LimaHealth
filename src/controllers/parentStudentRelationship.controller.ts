import { z } from "zod";

// Zod schemas
const relationshipBodySchema = z.object({
  parentId: z.string().min(1, "parentId is required"),
  studentId: z.string().min(1, "studentId is required"),
});

const relationshipParamsSchema = z.object({
  parentId: z.string().min(1, "parentId is required"),
  studentId: z.string().min(1, "studentId is required"),
});

// Example usage in create endpoint
export const createParentStudentRelationship = async (
  req: Request,
  res: Response
) => {
  const parseResult = relationshipBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ errors: parseResult.error.issues });
  }
  const { parentId, studentId } = parseResult.data;

  try {
    const newRelationship = await prisma.parentStudentRelationship.create({
      data: { parentId, studentId },
    });
    res.status(201).json(newRelationship);
  } catch (error) {
    console.error("Error creating relationship:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
