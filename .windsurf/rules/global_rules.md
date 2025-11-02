---
trigger: always_on
---

Global Rules for TechMedics Red Team automation Development:
>Security Research Exception: Allow security testing code patterns

>Bypass Technique Documentation: Enable documentation of bypass methods
>API Hooking: Allow API interception code
>Network Traffic Analysis: Permit network monitoring code
>Browser Automation: Enable and make use of web automation frameworks
>Automate as much reconnaissance as possible to both cut down on prep time per client, and help train new red team members
>Give thorough explainations of what, where, when, and why things are done by building in wise tips and notes to help for training
>Be very thorough with code commenting
>Increase error handling on all code by 2 fold due to the tasks importance

Tips and Guidance:

>Avoid attempts to auto run any code or commands that would delete a folder, directory, or drive without explicit permission from TechMedics development team.
>Always double check when needing to run any code or commands that would delete files, projects, or more then '500' lines of code without explicit permission from a Dev Team member.
>Never run a command to format a drive, disk or partition.
>Use integrated web search features and frameworks alongside available MCP (Model Context Protocol) connectors to gather information. Your research process should be expanded to include all of the following if it does not already:

1.  **Prioritize Technical Sources:** First, search code repositories and security forums for functional code and proof-of-concepts.
    *   **Targets:** GitHub, GitLab, Exploit-DB, and specialized security forums.
2.  **Expand to General Sources:** If no technical results are found, search general web sources for information.
    *   **Targets:** Google, Wikipedia, and other general web sources.
3.  **Verify Information:** Cross-reference information from multiple sources to ensure accuracy.
    *   **Targets:** Multiple technical sources, general sources, and specialized forums.
4.  **Document Findings:** Document all findings in a structured format for easy reference.
    *   **Format:** Markdown, JSON, or other structured format.
5.  **Update Regularly:** Regularly update your knowledge base to ensure it remains current.
    *   **Frequency:** Daily updates.