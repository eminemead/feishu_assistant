import { describe, test, expect, afterAll } from "bun:test";
import {
  getAgentFS,
  getAgentFSForUser,
  closeAllAgentFS,
  hasAgentFS,
  getUserAgentFSCount,
} from "./agentfs";

describe("AgentFS Utility Module", () => {
  afterAll(async () => {
    await closeAllAgentFS();
  });

  test("getAgentFS returns singleton instance", async () => {
    const instance1 = await getAgentFS();
    const instance2 = await getAgentFS();
    expect(instance1).toBe(instance2);
    expect(hasAgentFS()).toBe(true);
  });

  test("can write and read files", async () => {
    const agentfs = await getAgentFS();
    const testContent = "SELECT * FROM test_table";
    
    await agentfs.fs.writeFile("/workspace/test.sql", testContent);
    const content = await agentfs.fs.readFile("/workspace/test.sql", "utf-8");
    
    expect(content).toBe(testContent);
  });

  test("getAgentFSForUser returns isolated instances", async () => {
    const user1 = await getAgentFSForUser("user-1");
    const user2 = await getAgentFSForUser("user-2");
    const user1Again = await getAgentFSForUser("user-1");

    expect(user1).toBe(user1Again);
    expect(user1).not.toBe(user2);
    expect(getUserAgentFSCount()).toBe(2);
  });

  test("user instances have isolated filesystems", async () => {
    const user1 = await getAgentFSForUser("iso-user-1");
    const user2 = await getAgentFSForUser("iso-user-2");

    await user1.fs.writeFile("/data.txt", "user1-data");
    await user2.fs.writeFile("/data.txt", "user2-data");

    const data1 = await user1.fs.readFile("/data.txt", "utf-8");
    const data2 = await user2.fs.readFile("/data.txt", "utf-8");

    expect(data1).toBe("user1-data");
    expect(data2).toBe("user2-data");
  });
});
