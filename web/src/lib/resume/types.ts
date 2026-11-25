export interface Experience { title: string; company: string; location: string; start: string; end: string; bullets: string[] }
export interface Education { degree: string; school: string; location: string; year: string; gpa: string }
export interface Project { name: string; desc: string; bullets: string[] }

export interface ParsedResume {
  name: string; title: string; email: string; phone: string; location: string;
  linkedin: string; github: string; website: string; summary: string;
  experience: Experience[]; education: Education[]; skills: string[];
  projects: Project[]; certs: string[]; awards: string[];
}

export interface AtsCategory { name: string; score: number; max: number; note: string }
export interface AtsTip { sev: "high" | "med" | "low"; msg: string }
export interface AtsReport {
  total: number; cats: AtsCategory[]; hit: string[]; miss: string[]; kwCount: number; tips: AtsTip[];
}

export const emptyResume = (): ParsedResume => ({
  name: "", title: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "", summary: "",
  experience: [], education: [], skills: [], projects: [], certs: [], awards: [],
});
