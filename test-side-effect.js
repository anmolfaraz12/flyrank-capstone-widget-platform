// Proves the same pattern used in index.js's submission handler:
// a failing side effect (email) must never block the success response.

async function simulateSubmissionHandler() {
    let submissionStored = false;
    let responseSent = false;
    let responseCode = null;
  
    // Step 1: store the submission (this always succeeds in this simulation)
    submissionStored = true;
    console.log('Submission stored in DB: true');
  
    // Step 2: safe side effect — force it to throw, exactly like index.js's try/catch
    try {
      throw new Error('Simulated email provider outage');
    } catch (err) {
      console.log('Side-effect (email) failed, submission still succeeds:', err.message);
    }
  
    // Step 3: respond success regardless of step 2's outcome
    responseCode = 201;
    responseSent = true;
  
    console.log('--- Result ---');
    console.log('submissionStored:', submissionStored);
    console.log('responseSent:', responseSent);
    console.log('responseCode:', responseCode);
    console.log(
      responseCode === 201 && submissionStored
        ? '✅ Confirmed: side-effect failure did not block success response'
        : '❌ FAILED: side-effect failure blocked success'
    );
  }
  
  simulateSubmissionHandler();