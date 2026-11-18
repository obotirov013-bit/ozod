package com.skillorbit.waitlist;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.datasource.url=jdbc:h2:mem:waitlist-test;DB_CLOSE_DELAY=-1",
                "skillorbit.rate-limit.requests-per-minute=1000"
        })
@AutoConfigureMockMvc
class WaitlistControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void registersNewEmailAndNormalizesIt() throws Exception {
        mvc.perform(post("/api/waitlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"  Ada@Example.COM \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("REGISTERED"))
                .andExpect(jsonPath("$.email").value("ada@example.com"))
                .andExpect(jsonPath("$.position").isNumber());
    }

    @Test
    void secondSignUpWithSameEmailIsIdempotent() throws Exception {
        String body = "{\"email\": \"grace@example.com\", \"source\": \"landing\"}";
        mvc.perform(post("/api/waitlist").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/waitlist").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ALREADY_REGISTERED"));
    }

    @Test
    void rejectsMalformedEmailWithHelpfulMessage() throws Exception {
        mvc.perform(post("/api/waitlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"bad@\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Enter an email like name@example.com."))
                .andExpect(jsonPath("$.fields.email").exists());
    }

    @Test
    void rejectsBlankEmail() throws Exception {
        mvc.perform(post("/api/waitlist")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Enter your email to join the waitlist."));
    }

    @Test
    void returnsWaitlistCount() throws Exception {
        mvc.perform(get("/api/waitlist/count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").isNumber());
    }
}
