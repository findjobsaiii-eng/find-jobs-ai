import { describe, expect, it } from "vitest";
import {
  canonicalSkillKeys,
  namedSkillsInText,
  normalizeSkillTerm,
  resolveSkillIdentity,
  skillsEquivalent,
} from "./skillIdentity";

describe("shared skill identity", () => {
  it("extracts whole skill aliases in prose without collapsing composite technologies", () => {
    expect(
      namedSkillsInText(
        "React Native, ReactJS, C++, C#, Postgres, JavaScript and כושר ביטוי; JavaScripted is not Java language.",
      ),
    ).toEqual([
      "React Native",
      "React",
      "C++",
      "C#",
      "PostgreSQL",
      "JavaScript",
      "Verbal Communication",
      "Java",
    ]);
    expect(namedSkillsInText("JavaScripted Reactivity postgresqlite")).toEqual(
      [],
    );
  });
  it("matches exact Hebrew and English equivalents", () => {
    for (const alias of [
      "כושר ביטוי",
      "כושר התבטאות",
      "Oral Communication",
      "Verbal Communication",
    ]) {
      expect(resolveSkillIdentity(alias).key).toBe(
        "skill:verbal-communication",
      );
    }
    expect(skillsEquivalent("React.js", "ReactJS")).toBe(true);
    expect(skillsEquivalent("JS", "JavaScript")).toBe(true);
    expect(skillsEquivalent("אקסל", "Excel")).toBe(true);
    expect(
      canonicalSkillKeys(["React.js", "React", "JS", "JavaScript", " "]),
    ).toEqual(["skill:react", "skill:javascript"]);
  });

  it("does not equate related technology or communication requirements", () => {
    for (const [left, right] of [
      ["Java", "JavaScript"],
      ["React", "React Native"],
      ["C", "C++"],
      ["C++", "C#"],
      ["כושר ביטוי", "תקשורת בין-אישית"],
      ["כושר ביטוי", "עמידה מול קהל"],
      ["כושר ביטוי", "כושר ביטוי בכתב"],
      ["SQL", "PostgreSQL"],
    ])
      expect(skillsEquivalent(left, right)).toBe(false);
  });

  it("keeps unfamiliar and ambiguous terms truthful", () => {
    expect(resolveSkillIdentity("יכולת לדבר")).toEqual({
      key: "term:יכולת לדבר",
      known: false,
    });
    expect(skillsEquivalent("יכולת לדבר", "כושר ביטוי")).toBe(false);
    expect(skillsEquivalent("Flower   arranging", " flower arranging ")).toBe(
      true,
    );
    expect(skillsEquivalent("", " ")).toBe(false);
    expect(normalizeSkillTerm("  C++  ")).toBe("c++");
    expect(normalizeSkillTerm("קוֹשֶׁר   בִּיטוּי")).toBe("קושר ביטוי");
  });
});
