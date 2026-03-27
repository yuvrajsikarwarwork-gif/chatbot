import { findPlans } from "../models/planModel";

export async function listPlansService() {
  return findPlans();
}
