const express = require('express');
const router = express.Router();
const landingController = require('../controllers/landingController');

// Public routes - Landing Page
router.post('/start-chat', landingController.startChat);
router.post('/send-message', landingController.sendMessage);
router.get('/get-messages', landingController.getMessages);
router.post('/newsletter', landingController.newsletter);
router.post('/contact', landingController.contact);
router.post('/track-visit', landingController.trackVisit);

// Admin routes - Canlı Destek Yönetimi
router.get('/admin/chats', landingController.getChats);
router.get('/admin/chats/:id', landingController.getChatDetail);
router.post('/admin/chats/:id/send', landingController.sendAdminMessage);
router.post('/admin/chats/:id/close', landingController.closeChat);

module.exports = router;