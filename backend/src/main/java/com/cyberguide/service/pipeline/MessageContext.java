package com.cyberguide.service.pipeline;

/**
 * Context object passed through the message processing pipeline.
 * Each handler reads/writes fields as needed.
 */
public class MessageContext {

    private String userMessage;
    private String systemPrompt = "";
    private String evidence = "";
    private String aiResponse;
    private String processedMessage;
    private java.util.List<String> suggestions;
    private boolean crisis;
    private boolean aborted;
    private String sessionId;
    private String mode;
    private String scenario;
    private java.util.List<java.util.Map<String, String>> messages;

    private com.cyberguide.rag.UserProfileInferrer.UserProfile userProfile;
    private java.util.List<com.cyberguide.rag.RagService.RetrievalResult> retrievalResults;
    private com.cyberguide.rag.RagService.RetrievalMetadata retrievalMetadata;

    // --- Getters and Setters ---
    public String getUserMessage() { return userMessage; }
    public void setUserMessage(String userMessage) { this.userMessage = userMessage; }

    public String getSystemPrompt() { return systemPrompt; }
    public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }

    public String getEvidence() { return evidence; }
    public void setEvidence(String evidence) { this.evidence = evidence; }

    public String getAiResponse() { return aiResponse; }
    public void setAiResponse(String aiResponse) { this.aiResponse = aiResponse; }

    public String getProcessedMessage() { return processedMessage; }
    public void setProcessedMessage(String processedMessage) { this.processedMessage = processedMessage; }

    public java.util.List<String> getSuggestions() { return suggestions; }
    public void setSuggestions(java.util.List<String> suggestions) { this.suggestions = suggestions; }

    public boolean isCrisis() { return crisis; }
    public void setCrisis(boolean crisis) { this.crisis = crisis; }

    public boolean isAborted() { return aborted; }
    public void setAborted(boolean aborted) { this.aborted = aborted; }

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public String getScenario() { return scenario; }
    public void setScenario(String scenario) { this.scenario = scenario; }

    public java.util.List<java.util.Map<String, String>> getMessages() { return messages; }
    public void setMessages(java.util.List<java.util.Map<String, String>> messages) { this.messages = messages; }

    public com.cyberguide.rag.UserProfileInferrer.UserProfile getUserProfile() { return userProfile; }
    public void setUserProfile(com.cyberguide.rag.UserProfileInferrer.UserProfile userProfile) { this.userProfile = userProfile; }

    public java.util.List<com.cyberguide.rag.RagService.RetrievalResult> getRetrievalResults() { return retrievalResults; }
    public void setRetrievalResults(java.util.List<com.cyberguide.rag.RagService.RetrievalResult> retrievalResults) { this.retrievalResults = retrievalResults; }

    public com.cyberguide.rag.RagService.RetrievalMetadata getRetrievalMetadata() { return retrievalMetadata; }
    public void setRetrievalMetadata(com.cyberguide.rag.RagService.RetrievalMetadata retrievalMetadata) { this.retrievalMetadata = retrievalMetadata; }
}
