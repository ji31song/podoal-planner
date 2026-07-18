package com.jisong.podoalplanner;

import android.os.Bundle;

import androidx.annotation.Nullable;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.appcheck.FirebaseAppCheck;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        FirebaseAppCheck appCheck = FirebaseAppCheck.getInstance();
        appCheck.installAppCheckProviderFactory(
                AppCheckProviderFactorySelector.get(),
                true);
        super.onCreate(savedInstanceState);
    }
}
